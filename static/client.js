
const catalog = document.querySelector('#catalog');
const msg = document.querySelector('#message');
const orderForm = document.querySelector('#orderForm');

let products = [];
let quantities = {};
let sending = false;

// CARGAR PRODUCTOS
async function load() {
  try {
    msg.textContent = 'Cargando productos...';
    msg.className = '';

    const response = await fetch('/api/products', {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error('No se pudieron cargar los productos.');
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error('La respuesta del servidor no es válida.');
    }

    products = data;
    render();

    msg.textContent = products.length
      ? ''
      : 'No hay productos disponibles.';

    msg.className = '';

  } catch (error) {
    console.error('Error cargando productos:', error);
    msg.textContent =
      'No se pudo cargar el catálogo: ' + error.message;
    msg.className = 'error';
  }
}

// MOSTRAR PRODUCTOS AGRUPADOS POR PROVEEDOR
function render() {
  const alreadyRendered =
    catalog.querySelector('details.category') !== null;

  const openCategories = new Set(
    [...catalog.querySelectorAll('details.category[open]')]
      .map(section => section.dataset.category)
  );

  catalog.innerHTML = '';

  const groups = {};

  products.forEach(product => {
    const category = product.category || 'Sin proveedor';

    if (!groups[category]) {
      groups[category] = [];
    }

    groups[category].push(product);
  });

  Object.entries(groups).forEach(
    ([category, groupProducts], index) => {

      const section = document.createElement('details');
      section.className = 'category';
      section.dataset.category = category;

      section.open = alreadyRendered
        ? openCategories.has(category)
        : index === 0;

      const summary = document.createElement('summary');
      summary.textContent = category;
      summary.style.cursor = 'pointer';
      summary.style.fontWeight = '700';
      summary.style.padding = '12px 0';

      section.appendChild(summary);

      groupProducts.forEach(product => {
        const quantity = quantities[product.id] || 0;

        const row = document.createElement('div');
        row.className = 'product';

        const info = document.createElement('div');

        const name = document.createElement('div');
        name.className = 'product-name';
        name.textContent = product.name;

        info.appendChild(name);

        const controls = document.createElement('div');
        controls.className = 'qty';

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.textContent = '−';
        removeButton.disabled = quantity === 0;

        removeButton.addEventListener('click', () => {
          setQty(product.id, Math.max(0, quantity - 1));
        });

        const quantityLabel = document.createElement('span');
        quantityLabel.textContent = quantity;

        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.textContent = '+';
        addButton.disabled = quantity >= 99;

        addButton.addEventListener('click', () => {
          setQty(product.id, Math.min(99, quantity + 1));
        });

        controls.append(
          removeButton,
          quantityLabel,
          addButton
        );

        row.append(info, controls);
        section.appendChild(row);
      });

      catalog.appendChild(section);
    }
  );
}

// CAMBIAR CANTIDAD SIN CERRAR EL PROVEEDOR
function setQty(id, quantity) {
  quantities[id] = quantity;
  render();
}

// ENVIAR PEDIDO Y OFRECER DESCARGA DEL PDF
orderForm.addEventListener('submit', async event => {
  event.preventDefault();

  if (sending) return;

  const customer =
    document.querySelector('#customer')?.value.trim() || '';

  const orderDate =
    document.querySelector('#orderDate')?.value || '';

  const notes =
    document.querySelector('#notes')?.value.trim() || '';

  const items = products
    .filter(product => (quantities[product.id] || 0) > 0)
    .map(product => ({
      product_id: product.id,
      quantity: quantities[product.id]
    }));

  if (!customer || !orderDate || items.length === 0) {
    msg.textContent =
      'Completá solicitante, fecha y al menos un producto.';
    msg.className = 'error';
    return;
  }

  const submitButton =
    orderForm.querySelector('button[type="submit"]');

  sending = true;

  if (submitButton) {
    submitButton.disabled = true;
  }

  msg.textContent = 'Enviando pedido...';
  msg.className = '';

  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        customer,
        order_date: orderDate,
        notes,
        items
      })
    });

    if (!response.ok) {
      const errorData = await response.json()
        .catch(() => ({}));

      throw new Error(
        errorData.error || 'No se pudo enviar el pedido.'
      );
    }

    const orderId =
      response.headers.get('X-Order-ID');

    const pdfBlob = await response.blob();

    const descargar = window.confirm(
      `Pedido #${orderId || ''} guardado correctamente.\n\n` +
      '¿Deseás descargar el PDF?'
    );

    if (descargar) {
      const url = URL.createObjectURL(pdfBlob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `pedido_${orderId || 'nuevo'}.pdf`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => {
        URL.revokeObjectURL(url);
        window.location.assign('/');
      }, 1500);

    } else {
      window.location.assign('/');
    }

  } catch (error) {
    console.error('Error enviando pedido:', error);

    msg.textContent =
      error.message || 'Error al enviar el pedido.';

    msg.className = 'error';

    sending = false;

    if (submitButton) {
      submitButton.disabled = false;
    }
  }
});

// INICIAR LA CARGA DEL CATÁLOGO
load();

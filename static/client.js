const catalog = document.querySelector('#catalog');
const msg = document.querySelector('#message');

const WHATSAPP_NUMBER = '59892310415';

let products = [];
let quantities = {};

async function load() {
  try {
    msg.textContent = 'Cargando productos...';
    msg.className = '';

    const response = await fetch('/api/products');

    if (!response.ok) {
      throw new Error('No se pudieron cargar los productos.');
    }

    products = await response.json();

    if (!Array.isArray(products)) {
      throw new Error('La respuesta del servidor no es válida.');
    }

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


function render() {
  catalog.innerHTML = '';

  const groups = {};

  products.forEach(product => {
    const category = product.category || 'Sin categoría';

    if (!groups[category]) {
      groups[category] = [];
    }

    groups[category].push(product);
  });

  Object.entries(groups).forEach(
    ([category, groupProducts], index) => {

      const section = document.createElement('details');
      section.className = 'category';
      section.open = index === 0;

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

        info.append(name);

        const controls = document.createElement('div');
        controls.className = 'qty';

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.textContent = '−';
        removeButton.disabled = quantity === 0;

        removeButton.addEventListener('click', () => {
          setQty(
            product.id,
            Math.max(0, quantity - 1)
          );
        });

        const quantityLabel = document.createElement('span');
        quantityLabel.textContent = quantity;

        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.textContent = '+';

        addButton.addEventListener('click', () => {
          setQty(
            product.id,
            Math.min(99, quantity + 1)
          );
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


function setQty(id, quantity) {
  quantities[id] = quantity;
  render();
}


document
  .querySelector('#orderForm')
  .addEventListener('submit', async event => {

    event.preventDefault();

    const customer =
      document.querySelector('#customer').value.trim();

    const notes =
      document.querySelector('#notes').value.trim();

    const items = products
      .filter(product => (quantities[product.id] || 0) > 0)
      .map(product => ({
        product_id: product.id,
        quantity: quantities[product.id]
      }));

    if (!customer) {
      msg.textContent = 'Ingresá tu nombre.';
      msg.className = 'error';
      return;
    }

    if (items.length === 0) {
      msg.textContent = 'Seleccioná al menos un producto.';
      msg.className = 'error';
      return;
    }

    // Abrimos la pestaña durante el clic para evitar bloqueos.
    const whatsappWindow = window.open('about:blank', '_blank');

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
          notes,
          items
        })
      });

      if (!response.ok) {
        let errorMessage = 'No se pudo enviar el pedido.';

        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (_) {}

        throw new Error(errorMessage);
      }

      const orderId = response.headers.get('X-Order-ID');

      if (!orderId) {
        throw new Error(
          'No se recibió el número del pedido.'
        );
      }

      const pdfBlob = await response.blob();

      if (!pdfBlob.size) {
        throw new Error(
          'El servidor devolvió un PDF vacío.'
        );
      }

      // Descargar el PDF.
      const pdfUrl = URL.createObjectURL(pdfBlob);

      const downloadLink = document.createElement('a');
      downloadLink.href = pdfUrl;
      downloadLink.download = `pedido_${orderId}.pdf`;

      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();

      setTimeout(() => {
        URL.revokeObjectURL(pdfUrl);
      }, 60000);

      // Preparar WhatsApp.
      const message =
        `Hola, recibimos el pedido #${orderId} de ${customer}. ` +
        'Adjunto el PDF con el detalle del pedido.';

      const whatsappUrl =
        `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

      if (whatsappWindow && !whatsappWindow.closed) {
        whatsappWindow.location.href = whatsappUrl;
      } else {
        window.location.href = whatsappUrl;
      }

      msg.textContent =
        `¡Pedido #${orderId} guardado! Se descargó el PDF. ` +
        'Adjuntalo en WhatsApp para enviarlo al negocio.';

      msg.className = 'success';

      quantities = {};

      document.querySelector('#orderForm').reset();

      render();

    } catch (error) {
      if (whatsappWindow && !whatsappWindow.closed) {
        whatsappWindow.close();
      }

      console.error('Error enviando pedido:', error);

      msg.textContent = error.message;
      msg.className = 'error';
    }
  });


load();

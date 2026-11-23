
const catalog = document.querySelector('#catalog');
const msg = document.querySelector('#message');
const orderForm = document.querySelector('#orderForm');

let products = [];
let quantities = {};
let sending = false;

// -------------------- CARGAR CATÁLOGO --------------------

async function load() {
  try {
    msg.textContent = 'Cargando productos...';
    msg.className = '';

    const response = await fetch('/api/products', { cache: 'no-store' });

    if (!response.ok) {
      throw new Error('No se pudieron cargar los productos.');
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error('La respuesta del servidor no es válida.');
    }

    products = data;
    render();

    msg.textContent = products.length ? '' : 'No hay productos disponibles.';
    msg.className = '';

  } catch (error) {
    console.error('Error cargando productos:', error);
    msg.textContent = 'No se pudo cargar el catálogo: ' + error.message;
    msg.className = 'error';
  }
}

// -------------------- MOSTRAR PRODUCTOS --------------------

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

    if (!groups[category]) groups[category] = [];
    groups[category].push(product);
  });

  Object.entries(groups).forEach(([category, groupProducts], index) => {
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
      info.append(name);

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

      controls.append(removeButton, quantityLabel, addButton);
      row.append(info, controls);
      section.appendChild(row);
    });

    catalog.appendChild(section);
  });
}

function setQty(id, quantity) {
  quantities[id] = quantity;
  render();
}

// -------------------- OPCIONES DEL PDF --------------------

function mostrarOpcionesPdf(pdfBlob, orderId) {
  const filename = `pedido_${orderId}.pdf`;

  const file = typeof File === 'function'
    ? new File([pdfBlob], filename, { type: 'application/pdf' })
    : null;

  const dialog = document.createElement('dialog');
  dialog.style.cssText =
    'border:1px solid #ddd;border-radius:14px;padding:22px;' +
    'width:min(92vw,420px);max-width:420px;box-sizing:border-box;';

  const title = document.createElement('h3');
  title.textContent = `Pedido #${orderId} enviado correctamente`;
  title.style.margin = '0 0 8px';

  const description = document.createElement('p');
  description.textContent = '¿Qué querés hacer con el PDF?';

  const actions = document.createElement('div');
  actions.style.cssText =
    'display:flex;flex-wrap:wrap;gap:8px;margin-top:20px;';

  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.className = 'primary';
  downloadButton.textContent = 'Descargar PDF';

  const shareButton = document.createElement('button');
  shareButton.type = 'button';
  shareButton.className = 'secondary';
  shareButton.textContent = 'Compartir';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'secondary';
  closeButton.textContent = 'No descargar';

  const notice = document.createElement('p');
  notice.style.cssText = 'font-size:13px;margin-top:12px;';

  let shareSupported =
    Boolean(file) && typeof navigator.share === 'function';

  if (shareSupported && typeof navigator.canShare === 'function') {
    try {
      shareSupported = navigator.canShare({ files: [file] });
    } catch {
      shareSupported = false;
    }
  }

  if (!shareSupported) {
    shareButton.disabled = true;
    notice.textContent =
      'Compartir archivos no está disponible en este navegador. ' +
      'Podés descargar el PDF y compartirlo manualmente.';
  }

  function finish() {
    dialog.close();
    dialog.remove();
    window.location.assign('/');
  }

  downloadButton.addEventListener('click', () => {
    const url = URL.createObjectURL(pdfBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setTimeout(finish, 1200);
  });

  shareButton.addEventListener('click', async () => {
    if (!shareSupported) return;

    try {
      await navigator.share({
        files: [file],
        title: `Pedido #${orderId}`
      });

      finish();

    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error('No se pudo compartir el PDF:', error);

        notice.textContent =
          'No se pudo compartir. Podés intentar de nuevo o descargar el PDF.';
      }
    }
  });

  closeButton.addEventListener('click', finish);

  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    finish();
  });

  actions.append(downloadButton, shareButton, closeButton);
  dialog.append(title, description, actions, notice);

  document.body.appendChild(dialog);
  dialog.showModal();
}

// -------------------- ENVIAR PEDIDO --------------------

orderForm.addEventListener('submit', async event => {
  event.preventDefault();

  if (sending) return;

  const customer = document.querySelector('#customer')?.value.trim() || '';
  const orderDate = document.querySelector('#orderDate')?.value || '';
  const notes = document.querySelector('#notes')?.value.trim() || '';

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

  sending = true;
  let orderSaved = false;

  const submitButton = orderForm.querySelector('button[type="submit"]');

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
      const errorData = await response.json().catch(() => ({}));

      throw new Error(
        errorData.error || 'No se pudo enviar el pedido.'
      );
    }

    // El servidor confirmó que el pedido fue guardado.
    orderSaved = true;

    const orderId = response.headers.get('X-Order-ID');

    if (!orderId) {
      throw new Error(
        'Se recibió el PDF, pero no el número de pedido.'
      );
    }

    const pdfBlob = await response.blob();

    if (!pdfBlob.size) {
      throw new Error('El servidor devolvió un PDF vacío.');
    }

    mostrarOpcionesPdf(pdfBlob, orderId);

  } catch (error) {
    console.error('Error enviando pedido:', error);

    msg.textContent = orderSaved
      ? 'El pedido se guardó, pero hubo un problema con el PDF: ' +
        error.message + '. No lo envíes otra vez.'
      : (error.message || 'Error al enviar el pedido.');

    msg.className = 'error';

    if (!orderSaved) {
      sending = false;

      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  }
});

// -------------------- INICIO --------------------

load();

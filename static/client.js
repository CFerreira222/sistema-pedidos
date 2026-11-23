
const catalog = document.querySelector('#catalog');
const msg = document.querySelector('#message');
const orderForm = document.querySelector('#orderForm');

let products = [];
let quantities = {};
let sending = false;
let lastSavedOrder = null;

// -------------------- CARGAR PRODUCTOS --------------------

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

    if (!groups[category]) {
      groups[category] = [];
    }

    groups[category].push(product);
  });

  Object.entries(groups).forEach(([category, groupProducts]) => {
    const section = document.createElement('details');

    section.className = 'category';
    section.dataset.category = category;

    // Todos empiezan cerrados.
    // Conservar abiertos los que el usuario despliegue.
    section.open = alreadyRendered && openCategories.has(category);

    const summary = document.createElement('summary');

    summary.textContent = category;
    summary.style.cursor = 'pointer';
    summary.style.fontWeight = '700';
    summary.style.padding = '12px 0';

    section.appendChild(summary);

    groupProducts.forEach(product => {
      const id = product.id;
      const quantity = quantities[id] || 0;

      const row = document.createElement('div');
      row.className = 'product';

      const info = document.createElement('div');

      const name = document.createElement('div');
      name.className = 'product-name';
      name.textContent = product.name;

      info.append(name);

      const controls = document.createElement('div');
      controls.className = 'qty';

      // BOTÓN RESTAR
      const removeButton = document.createElement('button');

      removeButton.type = 'button';
      removeButton.textContent = '−';
      removeButton.disabled = sending || quantity === 0;

      removeButton.setAttribute(
        'aria-label',
        `Restar ${product.name}`
      );

      // CAMPO PARA ESCRIBIR LA CANTIDAD
      const quantityInput = document.createElement('input');

      quantityInput.type = 'number';
      quantityInput.className = 'qty-input';

      quantityInput.min = '0';
      quantityInput.max = '250';
      quantityInput.step = '1';
      quantityInput.inputMode = 'numeric';

      quantityInput.value = String(quantity);
      quantityInput.disabled = sending;

      quantityInput.setAttribute(
        'aria-label',
        `Cantidad de ${product.name}`
      );

      quantityInput.style.cssText =
        'width:64px;min-width:0;text-align:center;' +
        'padding:6px 3px;box-sizing:border-box;';

      // BOTÓN SUMAR
      const addButton = document.createElement('button');

      addButton.type = 'button';
      addButton.textContent = '+';
      addButton.disabled = sending || quantity >= 99;

      addButton.setAttribute(
        'aria-label',
        `Sumar ${product.name}`
      );

      // ACTUALIZAR BOTONES
      function updateButtons(value) {
        removeButton.disabled = sending || value === 0;
        addButton.disabled = sending || value >= 99;
      }

      // ESCRIBIR CANTIDAD SIN CERRAR EL PROVEEDOR
      quantityInput.addEventListener('input', () => {
        if (sending) return;

        const typed = quantityInput.value;

        if (typed === '') {
          quantities[id] = 0;
          updateButtons(0);
          return;
        }

        if (!/^\d+$/.test(typed)) {
          return;
        }

        const value = Math.min(99, Number(typed));

        quantities[id] = value;

        if (Number(typed) > 99) {
          quantityInput.value = '99';
        }

        updateButtons(value);
      });

      // NORMALIZAR CUANDO TERMINA DE ESCRIBIR
      quantityInput.addEventListener('change', () => {
        const value = quantities[id] || 0;

        quantityInput.value = String(value);
        updateButtons(value);
      });

      // EVITAR VALORES NO VÁLIDOS
      quantityInput.addEventListener('keydown', event => {
        if (
          ['e', 'E', '+', '-', '.', ','].includes(event.key)
        ) {
          event.preventDefault();
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          quantityInput.blur();
        }
      });

      // RESTAR
      removeButton.addEventListener('click', () => {
        setQty(
          id,
          (quantities[id] || 0) - 1
        );
      });

      // SUMAR
      addButton.addEventListener('click', () => {
        setQty(
          id,
          (quantities[id] || 0) + 1
        );
      });

      controls.append(
        removeButton,
        quantityInput,
        addButton
      );

      row.append(info, controls);
      section.appendChild(row);
    });

    catalog.appendChild(section);
  });
}

// -------------------- CAMBIAR CANTIDAD --------------------

function setQty(id, quantity) {
  if (sending) return;

  quantities[id] = Math.max(
    0,
    Math.min(99, Math.trunc(quantity))
  );

  render();
}

// -------------------- DESCARGAR / COMPARTIR PDF --------------------

function mostrarOpcionesPdf(pdfBlob, orderId) {
  const filename = `pedido_${orderId}.pdf`;

  const file = typeof File === 'function'
    ? new File(
        [pdfBlob],
        filename,
        { type: 'application/pdf' }
      )
    : null;

  const dialog = document.createElement('dialog');

  dialog.style.cssText =
    'border:1px solid #ddd;border-radius:14px;padding:22px;' +
    'width:min(92vw,420px);max-width:420px;box-sizing:border-box;';

  const title = document.createElement('h3');

  title.textContent =
    `Pedido #${orderId} guardado correctamente`;

  title.style.margin = '0 0 8px';

  const description = document.createElement('p');

  description.textContent =
    '¿Qué querés hacer con el PDF?';

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
  closeButton.textContent = 'Cerrar';

  const notice = document.createElement('p');

  notice.style.cssText =
    'font-size:13px;margin-top:12px;';

  let shareSupported =
    Boolean(file) &&
    typeof navigator.share === 'function';

  if (
    shareSupported &&
    typeof navigator.canShare === 'function'
  ) {
    try {
      shareSupported = navigator.canShare({
        files: [file]
      });

    } catch {
      shareSupported = false;
    }
  }

  if (!shareSupported) {
    shareButton.disabled = true;

    notice.textContent =
      'Este navegador no permite compartir PDFs directamente. ' +
      'Podés descargarlos y compartirlos manualmente.';
  }

  // CERRAR SIN REINICIAR EL FORMULARIO
  function closeDialog() {
    dialog.close();
    dialog.remove();

    msg.textContent =
      `Pedido #${orderId} guardado. ` +
      'Los datos del formulario siguen aquí.';

    msg.className = 'success';
  }

  // DESCARGAR PDF
  downloadButton.addEventListener('click', () => {
    const url = URL.createObjectURL(pdfBlob);

    const link = document.createElement('a');

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);

    closeDialog();
  });

  // COMPARTIR PDF
  shareButton.addEventListener('click', async () => {
    if (!shareSupported) return;

    try {
      await navigator.share({
        files: [file],
        title: `Pedido #${orderId}`
      });

      closeDialog();

    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error(
          'No se pudo compartir el PDF:',
          error
        );

        notice.textContent =
          'No se pudo compartir. ' +
          'Probá nuevamente o descargá el PDF.';
      }
    }
  });

  // CERRAR
  closeButton.addEventListener('click', closeDialog);

  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeDialog();
  });

  actions.append(
    downloadButton,
    shareButton,
    closeButton
  );

  dialog.append(
    title,
    description,
    actions,
    notice
  );

  document.body.appendChild(dialog);
  dialog.showModal();
}

// -------------------- ENVIAR PEDIDO --------------------

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

  // IDENTIFICAR LOS DATOS DEL PEDIDO
  const signature = JSON.stringify({
    customer,
    orderDate,
    notes,
    items
  });

  // EVITAR DUPLICAR PEDIDOS SIN CAMBIOS
  if (
    lastSavedOrder &&
    signature === lastSavedOrder.signature
  ) {
    if (lastSavedOrder.pdfBlob) {
      mostrarOpcionesPdf(
        lastSavedOrder.pdfBlob,
        lastSavedOrder.orderId
      );

    } else {
      msg.textContent =
        `El pedido #${lastSavedOrder.orderId || ''} ` +
        'ya se guardó, pero hubo un problema con el PDF. ' +
        'Revisalo en Administración; no lo envíes de nuevo.';

      msg.className = 'error';
    }

    return;
  }

  const submitButton =
    orderForm.querySelector('button[type="submit"]');

  sending = true;

  // IMPEDIR CAMBIOS DURANTE EL ENVÍO
  render();

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

    lastSavedOrder = {
      signature,
      orderId,
      pdfBlob: null
    };

    if (!orderId) {
      throw new Error(
        'El servidor no devolvió el número del pedido.'
      );
    }

    const pdfBlob = await response.blob();

    if (!pdfBlob.size) {
      throw new Error(
        'El servidor devolvió un PDF vacío.'
      );
    }

    lastSavedOrder.pdfBlob = pdfBlob;

    mostrarOpcionesPdf(pdfBlob, orderId);

  } catch (error) {
    console.error('Error enviando pedido:', error);

    msg.textContent =
      lastSavedOrder?.signature === signature
        ? 'El pedido se guardó, pero hubo un problema ' +
          'con el PDF: ' + error.message +
          '. No lo envíes de nuevo.'
        : (error.message || 'Error al enviar el pedido.');

    msg.className = 'error';

  } finally {
    sending = false;

    if (submitButton) {
      submitButton.disabled = false;
    }

    render();
  }
});

// -------------------- INICIO --------------------

load();

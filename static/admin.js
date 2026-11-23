
const ordersEl = document.querySelector('#orders');
const productsEl = document.querySelector('#products');
const productMsg = document.querySelector('#productMessage');
const categorySelect = document.querySelector('#category');
const categoryForm = document.querySelector('#category-form');
const categoryInput = document.querySelector('#new-category');
const categoryMsg = document.querySelector('#category-message');
const categoriesList = document.querySelector('#categories-list');
const productForm = document.querySelector('#productForm');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function getCategoryName(category) {
  return typeof category === 'string'
    ? category
    : (category?.name || '');
}

async function readResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...options
  });

  const data = await readResponse(response);

  if (!response.ok) {
    throw new Error(
      data.error ||
      data.message ||
      `Error HTTP ${response.status}`
    );
  }

  return data;
}

// -------------------- COMPARTIR / DESCARGAR PDF --------------------

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
  title.textContent = `Pedido #${orderId}`;
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
  closeButton.textContent = 'Cancelar';

  const notice = document.createElement('p');
  notice.style.cssText = 'font-size:13px;margin-top:12px;';

  let shareSupported = Boolean(file) && typeof navigator.share === 'function';
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

  function closeDialog() {
    dialog.close();
    dialog.remove();
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
    closeDialog();
  });

  shareButton.addEventListener('click', async () => {
    if (!shareSupported) return;

    // navigator.share debe activarse directamente desde este clic.
    try {
      await navigator.share({
        files: [file],
        title: `Pedido #${orderId}`
      });
      closeDialog();
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error('No se pudo compartir el PDF:', error);
        notice.textContent =
          'No se pudo compartir. Podés intentar de nuevo o descargar el PDF.';
      }
    }
  });

  closeButton.addEventListener('click', closeDialog);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeDialog();
  });

  actions.append(downloadButton, shareButton, closeButton);
  dialog.append(title, description, actions, notice);
  document.body.appendChild(dialog);
  dialog.showModal();
}

// -------------------- PESTAÑAS --------------------

function showCategoriesTab() {
  const tab = document.querySelector(
    '.admin-tab[data-tab="categories-section"]'
  );
  const panel = document.getElementById('categories-section');

  if (!tab || !panel) return;

  document.querySelectorAll('.admin-tab').forEach(button => {
    const active = button === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });

  document.querySelectorAll('.admin-section').forEach(section => {
    section.hidden = section === panel ? false : true;
  });
}

// -------------------- PEDIDOS --------------------

const pendingOnly = document.querySelector('#pending-only');
const pendingProvider = document.querySelector('#pending-provider');
const receiptDialog = document.querySelector('#receipt-dialog');
const receiptQuantity = document.querySelector('#receipt-quantity');
const receiptMessage = document.querySelector('#receipt-message');
let activeReceipt = null;
let loadingSequence = 0;
let savingReceipt = false;
let lastView = '';

async function saveReceipt(order, changes) {
  savingReceipt = true;
  loadingSequence++;
  try {
    await apiFetch('/api/orders/' + order.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...changes, receipt_version: order.receipt_version })
    });
    receiptMessage.textContent = 'Pedido #' + order.id + ' actualizado.';
  } catch (error) {
    receiptMessage.textContent = error.message || 'No se pudo actualizar el pedido.';
  } finally {
    savingReceipt = false;
    lastView = '';
    await loadOrders();
  }
}

function editReceipt(order, item) {
  activeReceipt = { order, item };
  document.querySelector('#receipt-description').textContent =
    'Pedido #' + order.id + ' · ' + item.name + ' · ' + item.quantity + ' unidades pedidas.';
  receiptQuantity.max = item.quantity;
  receiptQuantity.value = item.received;
  receiptDialog.showModal();
  receiptQuantity.focus();
  receiptQuantity.select();
}

document.querySelector('#receipt-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!activeReceipt || savingReceipt) return;
  const { order, item } = activeReceipt;
  const received = receiptQuantity.valueAsNumber;
  receiptDialog.close();
  await saveReceipt(order, { line_id: item.id, received });
});
document.querySelector('#receipt-cancel').addEventListener('click', () => receiptDialog.close());
receiptDialog.addEventListener('close', () => { activeReceipt = null; });

function refreshProviderOptions(orders) {
  const selected = pendingProvider.value;
  const names = new Set(orders.flatMap(order => order.items.map(item => item.provider)));
  // Conservar la selección si se acaba de completar su último pendiente.
  if (selected && selected !== '*') names.add(JSON.parse(selected));
  const options = [new Option('Todos', '*')];
  for (const name of [...names].sort((a, b) => a.localeCompare(b, 'es'))) {
    options.push(new Option(name || 'Proveedor desconocido', JSON.stringify(name)));
  }
  pendingProvider.replaceChildren(...options);
  pendingProvider.value = selected || '*';
}

pendingOnly.addEventListener('change', () => {
  pendingProvider.disabled = !pendingOnly.checked;
  loadOrders();
});
pendingProvider.addEventListener('change', loadOrders);

async function loadOrders() {
  if (!ordersEl || receiptDialog.open || savingReceipt) return;
  const seq = ++loadingSequence;
  const pending = pendingOnly.checked;
  try {
    let orders = await apiFetch(pending ? '/api/orders?pending=1' : '/api/orders');
    if (seq !== loadingSequence || receiptDialog.open || savingReceipt) return;
    if (!Array.isArray(orders)) throw new Error('Respuesta de pedidos no válida.');
    const view = JSON.stringify([pending, pendingProvider.value, orders]);
    if (view === lastView) return;
    if (pending) {
      refreshProviderOptions(orders);
      if (pendingProvider.value !== '*') {
        const provider = JSON.parse(pendingProvider.value);
        orders = orders.map(order => ({
          ...order, items: order.items.filter(item => item.provider === provider)
        })).filter(order => order.items.length);
      }
    }
    lastView = view;
    if (!orders.length) {
      ordersEl.textContent = pending ? 'No hay entregas pendientes para este filtro.' : 'Todavía no hay pedidos.';
      return;
    }
    ordersEl.innerHTML = '';

    orders.forEach(order => {
      const card = document.createElement('article');
      card.className = 'order-card';

      const top = document.createElement('div');
      top.className = 'order-top';

      const meta = document.createElement('div');
      meta.innerHTML = `
        <div class="order-id">
          Pedido #${escapeHtml(order.id)} ·
          ${escapeHtml(order.customer)}
        </div>
        <div class="order-time">
          Fecha solicitada: ${escapeHtml(order.order_date || 'No indicada')}<br>
          Registrado: ${escapeHtml(order.created_at)}
        </div>
      `;

      const statusSelect = document.createElement('select');
      statusSelect.className = 'status';

      const statuses = [
        'Pedido',
        'Recibido',
        'Sin stock'
      ];

      statuses.forEach(status => {
        const option = document.createElement('option');
        option.value = status;
        option.textContent = status;
        option.selected = order.status === status;
        statusSelect.append(option);
      });

      // Mostrar estados históricos sin cambiarlos en la base de datos.
      if (order.status && !statuses.includes(order.status)) {
        const oldOption = document.createElement('option');
        oldOption.value = '';
        oldOption.textContent = order.status === 'Parcial' ? 'Parcial' : 'Estado anterior: ' + order.status;
        oldOption.disabled = true;
        oldOption.selected = true;
        statusSelect.append(oldOption);
      }

      const displayedStatus = statusSelect.value;
      statusSelect.addEventListener('change', async () => {
        if (savingReceipt) {
          statusSelect.value = displayedStatus;
          return;
        }
        const next = statusSelect.value;
        if (next === 'Recibido' || order.status === 'Recibido') {
          const warning = next === 'Recibido'
            ? '¿Marcar como recibidas todas las unidades del pedido completo?'
            : '¿Reabrir el pedido completo y poner en cero todas sus cantidades recibidas?';
          if (!window.confirm(warning)) {
            statusSelect.value = displayedStatus;
            return;
          }
        }
        statusSelect.disabled = true;
        await saveReceipt(order, { status: next });
      });

      top.append(meta, statusSelect);
      card.append(top);

      const list = document.createElement('ul');
      list.className = 'order-items';

      (order.items || []).forEach(item => {
        const li = document.createElement('li');

        li.className = 'receipt-line';
        const info = document.createElement('span');
        info.className = 'line-info';
        const name = document.createElement('strong');
        name.textContent = item.name;
        const detail = document.createElement('small');
        detail.textContent = (item.provider || 'Proveedor desconocido') +
          ' · Pedido: ' + item.quantity + ' · Recibido: ' + item.received +
          ' · Pendiente: ' + (item.quantity - item.received);
        info.append(name, detail);
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'secondary';
        edit.textContent = 'Registrar recepción';
        edit.setAttribute('aria-label', 'Registrar recepción de ' + item.name);
        edit.addEventListener('click', () => {
          if (!savingReceipt) editReceipt(order, item);
        });
        li.append(info, edit);
        list.append(li);
      });

      card.append(list);

      if (order.notes) {
        const note = document.createElement('div');
        note.className = 'notes';
        note.textContent = 'Nota: ' + order.notes;
        card.append(note);
      }

      const bottom = document.createElement('div');
      bottom.className = 'order-bottom';

      const count = document.createElement('span');
      count.className = 'muted';
      count.textContent =
        `${(order.items || []).length} línea(s) visible(s)`;

      bottom.append(count);

      const pdfButton = document.createElement('button');
      pdfButton.type = 'button';
      pdfButton.className = 'secondary';
      pdfButton.textContent = 'Exportar PDF';

      pdfButton.addEventListener('click', async () => {
        pdfButton.disabled = true;

        try {
          const response = await fetch(`/api/orders/${order.id}/pdf`, {
            cache: 'no-store'
          });

          if (!response.ok) {
            const error = await readResponse(response);
            throw new Error(error.error || 'No se pudo obtener el PDF.');
          }

          const pdf = await response.blob();
          if (!pdf.size) throw new Error('El PDF está vacío.');

          // Nunca cambia a la página del cliente.
          mostrarOpcionesPdf(pdf, order.id);
        } catch (error) {
          console.error('Error obteniendo PDF:', error);
          alert(error.message || 'No se pudo obtener el PDF.');
        } finally {
          pdfButton.disabled = false;
        }
      });

      bottom.append(pdfButton);
      card.append(bottom);

      ordersEl.append(card);
    });

  } catch (error) {
    if (seq !== loadingSequence || receiptDialog.open) return;
    lastView = '';
    console.error('Error cargando pedidos:', error);
    ordersEl.innerHTML =
      '<div class="empty">No se pudieron cargar los pedidos.</div>';
  }
}

// -------------------- PROVEEDORES Y PRODUCTOS --------------------

let lastProducts = [];
let lastCategories = [];
let showInactiveProducts = false;
let productSearchText = '';
const productOpenGroups = new Set();

async function fetchCategories(includeInactive = false) {
  const url = includeInactive
    ? '/api/categories?include_inactive=1'
    : '/api/categories';
  const data = await apiFetch(url);
  if (!Array.isArray(data)) throw new Error('Respuesta de proveedores inválida.');
  return data;
}

async function fetchProductsForAdmin() {
  const data = await apiFetch('/api/products/manage');
  if (!Array.isArray(data)) throw new Error('Respuesta de productos inválida.');
  return data;
}

function optionFor(value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function updateProviderSelectors(categories, selectedName) {
  const active = categories.filter(category => Number(category.active) === 1);

  if (categorySelect) {
    const choice = selectedName ?? categorySelect.value;
    categorySelect.replaceChildren(optionFor('', 'Elegí un proveedor'));
    active.forEach(category => {
      categorySelect.append(optionFor(category.name, category.name));
    });
    categorySelect.value = active.some(item => item.name === choice) ? choice : '';
  }

  // Mantener actualizado el selector del importador sin modificar su archivo.
  const excelSelect = document.querySelector('#excel-provider');
  if (excelSelect) {
    const previous = excelSelect.value;
    excelSelect.replaceChildren(optionFor('', 'Usar proveedor del Excel'));
    active.forEach(category => {
      excelSelect.append(optionFor(category.name, category.name));
    });
    const next = active.some(item => item.name === previous) ? previous : '';
    excelSelect.value = next;
    if (previous !== next) excelSelect.dispatchEvent(new Event('change'));
  }
}

async function refreshCatalog(selectedName) {
  const [categories, products] = await Promise.all([
    fetchCategories(true),
    fetchProductsForAdmin()
  ]);
  lastCategories = categories;
  lastProducts = products;
  updateProviderSelectors(categories, selectedName);
  renderProducts();
  renderCategories();
}

async function loadCategories(selectedName) {
  try {
    await refreshCatalog(selectedName);
  } catch (error) {
    console.error('Error cargando proveedores:', error);
    if (categoryMsg) {
      categoryMsg.textContent = error.message;
      categoryMsg.className = 'error';
    }
  }
}

async function loadProducts() {
  try {
    await refreshCatalog();
  } catch (error) {
    console.error('Error cargando productos:', error);
    if (productsEl) {
      productsEl.textContent = 'No se pudieron cargar los productos: ' + error.message;
    }
  }
}

function adminActionButton(text, action, danger = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.className = danger ? 'remove' : 'secondary';
  button.style.margin = '3px';
  button.addEventListener('click', action);
  return button;
}

function renderCategories() {
  if (!categoriesList) return;
  categoriesList.replaceChildren();

  if (!lastCategories.length) {
    categoriesList.textContent = 'Todavía no hay proveedores.';
    return;
  }

  lastCategories.forEach(category => {
    const associated = lastProducts.filter(p => p.category === category.name);
    const activeCount = associated.filter(p => Number(p.active) === 1).length;
    const archived = Number(category.active) !== 1;
    const card = document.createElement('div');
    card.className = 'category-group';
    card.style.cssText = 'border:1px solid #ddd;border-radius:10px;padding:12px;margin:8px 0;';

    const name = document.createElement('strong');
    name.textContent = `${category.name} — ${activeCount} activo(s), ` +
      `${associated.length - activeCount} desactivado(s)` +
      (archived ? ' [ARCHIVADO]' : '');
    card.append(name);

    const actions = document.createElement('div');
    actions.style.marginTop = '8px';

    actions.append(adminActionButton('Renombrar proveedor', async () => {
      const newName = window.prompt('Nuevo nombre del proveedor:', category.name);
      if (newName === null || newName.trim() === category.name) return;
      if (!newName.trim()) return alert('Ingresá un nombre válido.');
      if (!confirm(`¿Cambiar «${category.name}» a «${newName.trim()}»?\n` +
                   'Los artículos asociados pasarán al nuevo nombre.')) return;
      try {
        await apiFetch(`/api/categories/${category.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName.trim() })
        });
        await refreshCatalog();
        if (categoryMsg) {
          categoryMsg.textContent = 'Proveedor renombrado correctamente.';
          categoryMsg.className = 'success';
        }
      } catch (error) { alert(error.message); }
    }));

    if (archived) {
      actions.append(adminActionButton('Reactivar proveedor', async () => {
        try {
          await apiFetch(`/api/categories/${category.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active: true })
          });
          await refreshCatalog();
        } catch (error) { alert(error.message); }
      }));
    } else {
      const archive = adminActionButton('Archivar proveedor', async () => {
        if (!confirm(`¿Archivar «${category.name}»? No se borrarán sus artículos.`)) return;
        try {
          await apiFetch(`/api/categories/${category.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active: false })
          });
          await refreshCatalog();
        } catch (error) { alert(error.message); }
      });
      archive.disabled = activeCount > 0;
      archive.title = activeCount
        ? 'Primero desactivá o mové sus artículos activos'
        : 'Ocultar proveedor sin borrar su historial';
      actions.append(archive);
    }

    if (associated.length === 0) {
      actions.append(adminActionButton('Eliminar proveedor vacío', async () => {
        if (!confirm(`¿Eliminar definitivamente «${category.name}»?`)) return;
        try {
          await apiFetch(`/api/categories/${category.id}`, { method: 'DELETE' });
          await refreshCatalog();
        } catch (error) { alert(error.message); }
      }, true));
    }

    card.append(actions);
    const note = document.createElement('p');
    note.className = 'muted';
    note.style.fontSize = '12px';
    note.textContent = activeCount > 0
      ? 'Para archivar este proveedor, primero mové o desactivá sus artículos activos en Productos.'
      : 'Si conserva productos desactivados, se archiva en lugar de eliminarse para preservar sus datos.';
    card.append(note);
    categoriesList.append(card);
  });
}

function ensureProductTools() {
  if (!productsEl || document.querySelector('#admin-product-tools')) return;

  const controls = document.createElement('div');
  controls.id = 'admin-product-tools';
  controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:16px 0;';

  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Buscar artículo o proveedor';
  input.setAttribute('aria-label', 'Buscar artículos');
  input.style.cssText = 'flex:1;min-width:180px;max-width:400px;';
  input.value = productSearchText;
  input.addEventListener('input', () => {
    productSearchText = input.value;
    renderProducts();
  });

  const label = document.createElement('label');
  label.style.cssText = 'display:flex;align-items:center;gap:7px;';
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = showInactiveProducts;
  toggle.addEventListener('change', () => {
    showInactiveProducts = toggle.checked;
    renderProducts();
  });
  label.append(toggle, document.createTextNode('Mostrar desactivados'));

  controls.append(input, label);
  productsEl.before(controls);
}

function openProductEditor(product) {
  const activeProviders = lastCategories.filter(c => Number(c.active) === 1);
  if (!activeProviders.length) {
    alert('No hay proveedores activos para asignar el artículo.');
    return;
  }

  const dialog = document.createElement('dialog');
  dialog.style.cssText =
    'border:1px solid #ddd;border-radius:12px;padding:20px;' +
    'width:min(90vw,440px);box-sizing:border-box;';

  const title = document.createElement('h3');
  title.textContent = `Editar producto #${product.id}`;
  title.style.marginTop = '0';

  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Nombre del artículo';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.required = true;
  nameInput.maxLength = 100;
  nameInput.value = product.name;
  nameInput.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin:6px 0 14px;';
  nameLabel.append(nameInput);

  const providerLabel = document.createElement('label');
  providerLabel.textContent = 'Proveedor';
  const select = document.createElement('select');
  select.required = true;
  select.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin:6px 0 14px;';
  activeProviders.forEach(provider => {
    select.append(optionFor(provider.name, provider.name));
  });
  select.value = product.category;
  if (!select.value) select.selectedIndex = 0;
  providerLabel.append(select);

  const notice = document.createElement('p');
  notice.className = 'muted';
  notice.textContent = 'Los pedidos antiguos conservarán el nombre registrado originalmente.';

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'primary';
  save.textContent = 'Guardar cambios';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'secondary';
  cancel.textContent = 'Cancelar';
  cancel.style.marginLeft = '8px';
  cancel.addEventListener('click', () => dialog.close());

  save.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    const category = select.value;
    if (!name || !category) return alert('Completá nombre y proveedor.');
    save.disabled = true;
    try {
      await apiFetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category })
      });
      dialog.close();
      await refreshCatalog();
      if (productMsg) {
        productMsg.textContent = 'Artículo actualizado correctamente.';
        productMsg.className = 'success';
      }
    } catch (error) {
      alert(error.message || 'No se pudo actualizar el artículo.');
    } finally {
      save.disabled = false;
    }
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.append(title, nameLabel, providerLabel, notice, save, cancel);
  document.body.append(dialog);
  dialog.showModal();
}

function renderProducts() {
  if (!productsEl) return;
  ensureProductTools();

  // Conservar desplegables abiertos al refrescar o editar productos.
  productsEl.querySelectorAll('details[data-provider]').forEach(detail => {
    if (detail.open) productOpenGroups.add(detail.dataset.provider);
    else productOpenGroups.delete(detail.dataset.provider);
  });
  productsEl.replaceChildren();

  const query = productSearchText.trim().toLocaleLowerCase('es');
  const activeCount = lastProducts.filter(p => Number(p.active) === 1).length;
  const inactiveCount = lastProducts.length - activeCount;
  const count = document.createElement('p');
  count.className = 'muted';
  count.textContent = `${activeCount} artículos activos · ${inactiveCount} desactivados`;
  productsEl.append(count);

  const chosen = lastProducts.filter(p => {
    if (!showInactiveProducts && Number(p.active) !== 1) return false;
    const text = `${p.category} ${p.name}`.toLocaleLowerCase('es');
    return !query || text.includes(query);
  });

  if (!chosen.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No hay artículos con estos filtros.';
    productsEl.append(empty);
    return;
  }

  const groups = new Map();
  chosen.forEach(product => {
    if (!groups.has(product.category)) groups.set(product.category, []);
    groups.get(product.category).push(product);
  });

  [...groups].sort((a, b) => a[0].localeCompare(b[0], 'es')).forEach(([provider, items]) => {
    const detail = document.createElement('details');
    detail.className = 'product-group';
    detail.dataset.provider = provider;
    detail.open = query.length > 0 || productOpenGroups.has(provider);

    const summary = document.createElement('summary');
    summary.className = 'category-summary';
    summary.textContent = `${provider} (${items.length} artículos mostrados)`;
    detail.append(summary);

    items.forEach(product => {
      const row = document.createElement('div');
      row.className = 'product-row';
      row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid #eee;';

      const info = document.createElement('span');
      info.textContent = product.name + (Number(product.active) !== 1 ? ' [DESACTIVADO]' : '');
      row.append(info);

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';
      actions.append(adminActionButton('Editar', () => openProductEditor(product)));

      if (Number(product.active) === 1) {
        actions.append(adminActionButton('Eliminar del catálogo', async () => {
          if (!confirm(`¿Desactivar «${product.name}»?\n` +
                       'Dejará de aparecer en los nuevos pedidos; los pedidos anteriores se conservan.')) return;
          try {
            await apiFetch(`/api/products/${product.id}`, { method: 'DELETE' });
            await refreshCatalog();
          } catch (error) { alert(error.message); }
        }, true));
      } else {
        actions.append(adminActionButton('Reactivar producto', async () => {
          try {
            await apiFetch(`/api/products/${product.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ active: true })
            });
            await refreshCatalog();
          } catch (error) { alert(error.message); }
        }));
      }

      row.append(actions);
      detail.append(row);
    });

    detail.addEventListener('toggle', () => {
      if (detail.open) productOpenGroups.add(provider);
      else productOpenGroups.delete(provider);
    });
    productsEl.append(detail);
  });
}

// -------------------- CREAR CATEGORÍA --------------------

if (categoryForm) {
  categoryForm.addEventListener('submit', async event => {
    event.preventDefault();

    const name = categoryInput?.value.trim();

    if (!name) {
      if (categoryMsg) {
        categoryMsg.textContent =
          'Ingresá un nombre para el proveedor.';
        categoryMsg.className = 'error';
      }
      return;
    }

    const submitButton = categoryForm.querySelector(
      'button[type="submit"], input[type="submit"]'
    );

    if (submitButton) submitButton.disabled = true;

    if (categoryMsg) {
      categoryMsg.textContent = 'Creando proveedor...';
      categoryMsg.className = '';
    }

    try {
      await apiFetch('/api/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name })
      });

      categoryInput.value = '';

      await loadCategories(name);
      await loadProducts();

      if (categoryMsg) {
        categoryMsg.textContent = '¡Proveedor creado con éxito!';
        categoryMsg.className = 'success';
      }

      showCategoriesTab();

    } catch (error) {
      if (categoryMsg) {
        categoryMsg.textContent =
          error.message || 'Error al crear el proveedor.';
        categoryMsg.className = 'error';
      }

      console.error('Error al crear proveedor:', error);

    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

// -------------------- AGREGAR PRODUCTO --------------------

if (productForm) {
  productForm.addEventListener('submit', async event => {
    event.preventDefault();

    if (productMsg) {
      productMsg.textContent = 'Guardando...';
      productMsg.className = '';
    }

    const nameInput = document.querySelector('#productName');

    const body = {
      category: categorySelect?.value || '',
      name: nameInput?.value.trim() || ''
    };

    if (!body.category || !body.name) {
      if (productMsg) {
        productMsg.textContent =
          'Completá proveedor y producto.';
        productMsg.className = 'error';
      }
      return;
    }

    const submitButton = productForm.querySelector(
      'button[type="submit"], input[type="submit"]'
    );

    if (submitButton) submitButton.disabled = true;

    try {
      await apiFetch('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      productForm.reset();

      if (productMsg) {
        productMsg.textContent = 'Producto agregado con éxito.';
        productMsg.className = 'success';
      }

      await loadProducts();
      await loadCategories(body.category);

    } catch (error) {
      if (productMsg) {
        productMsg.textContent =
          error.message || 'Error al guardar el producto.';
        productMsg.className = 'error';
      }

      console.error('Error agregando producto:', error);

    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

// -------------------- ACTUALIZAR --------------------

const refreshButton = document.querySelector('#refresh');

if (refreshButton) {
  refreshButton.addEventListener('click', async () => {
    await Promise.all([
      loadOrders(),
      loadProducts()
    ]);
  });
}

// -------------------- INICIO --------------------

loadOrders();
loadProducts();

setInterval(loadOrders, 3000);
// No refrescar la edición cada 10 segundos: evita perder cambios en los controles.

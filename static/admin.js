
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
    section.hidden = section !== panel;
  });
}

// -------------------- PEDIDOS --------------------

async function loadOrders() {
  if (!ordersEl) return;

  try {
    const orders = await apiFetch('/api/orders');

    if (!Array.isArray(orders) || orders.length === 0) {
      ordersEl.innerHTML =
        '<div class="empty">Todavía no hay pedidos.</div>';
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
          Fecha solicitada:
          ${escapeHtml(order.order_date || 'No indicada')}<br>
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

      // Conservar visualmente los estados históricos.
      if (order.status && !statuses.includes(order.status)) {
        const oldOption = document.createElement('option');
        oldOption.value = '';
        oldOption.textContent =
          'Estado anterior: ' + order.status;
        oldOption.disabled = true;
        oldOption.selected = true;

        statusSelect.append(oldOption);
      }

      statusSelect.addEventListener('change', async () => {
        statusSelect.disabled = true;

        try {
          await apiFetch('/api/orders/' + order.id, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              status: statusSelect.value
            })
          });

        } catch (error) {
          alert(error.message || 'No se pudo actualizar el pedido.');
          await loadOrders();

        } finally {
          statusSelect.disabled = false;
        }
      });

      top.append(meta, statusSelect);
      card.append(top);

      const list = document.createElement('ul');
      list.className = 'order-items';

      (order.items || []).forEach(item => {
        const li = document.createElement('li');

        const quantity = document.createElement('span');
        quantity.textContent =
          `${item.quantity} × ${item.name}`;

        li.append(quantity);
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
        `${(order.items || []).length} línea(s) de productos`;

      bottom.append(count);

      // EXPORTAR Y COMPARTIR PDF
      const pdfButton = document.createElement('button');
      pdfButton.type = 'button';
      pdfButton.className = 'secondary';
      pdfButton.textContent = 'Exportar PDF';

      pdfButton.addEventListener('click', async () => {
        pdfButton.disabled = true;

        try {
          const response = await fetch(
            `/api/orders/${order.id}/pdf`,
            { cache: 'no-store' }
          );

          if (!response.ok) {
            const error = await readResponse(response);

            throw new Error(
              error.error || 'No se pudo obtener el PDF.'
            );
          }

          const pdf = await response.blob();

          if (!pdf.size) {
            throw new Error('El PDF está vacío.');
          }

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
    console.error('Error cargando pedidos:', error);

    ordersEl.innerHTML =
      '<div class="empty">No se pudieron cargar los pedidos.</div>';
  }
}

// -------------------- PROVEEDORES --------------------

async function fetchCategories() {
  const categories = await apiFetch('/api/categories');

  if (!Array.isArray(categories)) {
    throw new Error('La respuesta de proveedores no es válida.');
  }

  return categories;
}

async function fetchProducts() {
  const products = await apiFetch('/api/products');

  if (!Array.isArray(products)) {
    throw new Error('La respuesta de productos no es válida.');
  }

  return products;
}

async function loadCategories(selectedName = '') {
  try {
    const categories = await fetchCategories();

    if (categorySelect) {
      categorySelect.innerHTML =
        '<option value="">Elegí un proveedor</option>';

      categories.forEach(category => {
        const name = getCategoryName(category);

        if (!name) return;

        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        option.selected = name === selectedName;

        categorySelect.append(option);
      });
    }

    await renderCategories(categories);

    if (categoryMsg && !categoryMsg.classList.contains('error')) {
      categoryMsg.textContent = '';
    }

  } catch (error) {
    console.error('Error cargando proveedores:', error);

    if (categoryMsg) {
      categoryMsg.textContent =
        error.message || 'No se pudieron cargar los proveedores.';
      categoryMsg.className = 'error';
    }
  }
}

async function renderCategories(categories) {
  if (!categoriesList) return;

  const products = await fetchProducts();
  categoriesList.innerHTML = '';

  if (!categories.length) {
    categoriesList.innerHTML =
      '<div class="empty">Todavía no hay proveedores.</div>';
    return;
  }

  [...categories]
    .sort((a, b) =>
      getCategoryName(a).localeCompare(getCategoryName(b), 'es')
    )
    .forEach(category => {
      const name = getCategoryName(category);

      const id = typeof category === 'object'
        ? category.id
        : null;

      const matchingProducts = products.filter(
        product => product.category === name
      );

      const group = document.createElement('details');
      group.className = 'category-group';

      const summary = document.createElement('summary');
      summary.className = 'category-summary';
      summary.textContent =
        `${name} (${matchingProducts.length} productos)`;

      group.append(summary);

      const content = document.createElement('div');
      content.className = 'category-products';

      if (!matchingProducts.length) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent =
          'Este proveedor todavía no tiene productos.';

        content.append(empty);

      } else {
        matchingProducts.forEach(product => {
          const row = document.createElement('div');
          row.className = 'product-row';

          const info = document.createElement('span');
          info.innerHTML =
            `<strong>${escapeHtml(product.name)}</strong>`;

          row.append(info);
          content.append(row);
        });
      }

      if (id !== null && id !== undefined) {
        const remove = document.createElement('button');
        remove.className = 'remove';
        remove.type = 'button';
        remove.textContent = 'Eliminar proveedor';

        remove.addEventListener('click', async () => {
          if (matchingProducts.length) {
            alert(
              'Este proveedor tiene productos asociados. ' +
              'No se puede eliminar hasta quitar o reasignar esos productos.'
            );
            return;
          }

          if (!confirm(`¿Eliminar el proveedor "${name}"?`)) {
            return;
          }

          try {
            await apiFetch('/api/categories/' + id, {
              method: 'DELETE'
            });

            await loadCategories();

            if (categoryMsg) {
              categoryMsg.textContent = 'Proveedor eliminado.';
              categoryMsg.className = 'success';
            }

          } catch (error) {
            alert(error.message || 'No se pudo eliminar el proveedor.');
          }
        });

        content.append(remove);
      }

      group.append(content);
      categoriesList.append(group);
    });
}

// -------------------- PRODUCTOS --------------------

async function loadProducts() {
  if (!productsEl) return;

  try {
    const [products, categories] = await Promise.all([
      fetchProducts(),
      fetchCategories()
    ]);

    productsEl.innerHTML = '';
    const groups = {};

    categories.forEach(category => {
      const name = getCategoryName(category);
      if (name) groups[name] = [];
    });

    products.forEach(product => {
      const category = product.category || 'Sin categoría';

      if (!groups[category]) {
        groups[category] = [];
      }

      groups[category].push(product);
    });

    const names = Object.keys(groups).sort((a, b) =>
      a.localeCompare(b, 'es')
    );

    if (!names.length) {
      productsEl.innerHTML =
        '<div class="empty">Primero creá un proveedor.</div>';
      return;
    }

    names.forEach(category => {
      const details = document.createElement('details');
      details.className = 'product-group';

      const heading = document.createElement('summary');
      heading.className = 'category-summary';
      heading.textContent =
        `${category} (${groups[category].length} productos)`;

      details.append(heading);

      if (!groups[category].length) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent =
          'Todavía no hay productos en este proveedor.';

        details.append(empty);
      }

      groups[category].forEach(product => {
        const row = document.createElement('div');
        row.className = 'product-row';

        const info = document.createElement('span');
        info.innerHTML =
          `<strong>${escapeHtml(product.name)}</strong>`;

        const remove = document.createElement('button');
        remove.className = 'remove';
        remove.type = 'button';
        remove.textContent = 'Quitar';

        remove.addEventListener('click', async () => {
          if (!confirm(`¿Quitar ${product.name} del catálogo?`)) {
            return;
          }

          try {
            await apiFetch('/api/products/' + product.id, {
              method: 'DELETE'
            });

            await loadProducts();
            await loadCategories();

          } catch (error) {
            alert(error.message || 'No se pudo quitar el producto.');
          }
        });

        row.append(info, remove);
        details.append(row);
      });

      productsEl.append(details);
    });

  } catch (error) {
    console.error('Error cargando productos:', error);

    productsEl.innerHTML =
      '<div class="empty">No se pudieron cargar los productos.</div>';
  }
}

// -------------------- CREAR PROVEEDOR --------------------

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

    if (submitButton) {
      submitButton.disabled = true;
    }

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
      if (submitButton) {
        submitButton.disabled = false;
      }
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
        productMsg.textContent = 'Completá proveedor y producto.';
        productMsg.className = 'error';
      }
      return;
    }

    const submitButton = productForm.querySelector(
      'button[type="submit"], input[type="submit"]'
    );

    if (submitButton) {
      submitButton.disabled = true;
    }

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
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}

// -------------------- ACTUALIZAR --------------------

const refreshButton = document.querySelector('#refresh');

if (refreshButton) {
  refreshButton.addEventListener('click', async () => {
    await Promise.all([
      loadOrders(),
      loadProducts(),
      loadCategories()
    ]);
  });
}

// -------------------- INICIO --------------------

loadOrders();
loadProducts();
loadCategories();

setInterval(loadOrders, 3000);
setInterval(loadProducts, 10000);

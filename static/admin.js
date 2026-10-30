
const ordersEl = document.querySelector('#orders');
const productsEl = document.querySelector('#products');
const productMsg = document.querySelector('#productMessage');
const categorySelect = document.querySelector('#category');
const categoryForm = document.querySelector('#category-form');
const categoryInput = document.querySelector('#new-category');
const categoryMsg = document.querySelector('#category-message');
const categoriesList = document.querySelector('#categories-list');
const productForm = document.querySelector('#productForm');

const fmt = n =>
  '$ ' + Number(n || 0).toLocaleString('es-UY', {
    maximumFractionDigits: 0
  });

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
          ${escapeHtml(order.created_at)}
        </div>
      `;

      const statusSelect = document.createElement('select');
      statusSelect.className = 'status';

      [
        'Pedido',
  'Recibido',
  'Sin stock'
      ].forEach(status => {
        const option = document.createElement('option');
        option.value = status;
        option.textContent = status;
        option.selected = order.status === status;
        statusSelect.append(option);
      });

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

        const price = document.createElement('strong');
        price.textContent = fmt(
          Number(item.price || 0) * Number(item.quantity || 0)
        );

        li.append(quantity, price);
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

      const total = document.createElement('span');
      total.className = 'total';
      total.textContent = fmt(order.total);

      bottom.append(count, total);
      card.append(bottom);
      ordersEl.append(card);
    });
  } catch (error) {
    console.error('Error cargando pedidos:', error);
    ordersEl.innerHTML =
      '<div class="empty">No se pudieron cargar los pedidos.</div>';
  }
}

// -------------------- CATEGORÍAS --------------------

async function fetchCategories() {
  const categories = await apiFetch('/api/categories');

  if (!Array.isArray(categories)) {
    throw new Error('La respuesta de categorías no es válida.');
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
  if (categorySelect) {
    categorySelect.innerHTML =
      '<option value="">Elegí una categoría</option>';
  }

  try {
    const categories = await fetchCategories();

    if (categorySelect) {
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
  } catch (error) {
    console.error('Error cargando categorías:', error);

    if (categoryMsg) {
      categoryMsg.textContent =
        error.message || 'No se pudieron cargar las categorías.';
      categoryMsg.className = 'error';
    }
  }
}

async function renderCategories(categories) {
  if (!categoriesList) return;

  let products;

  try {
    products = await fetchProducts();
  } catch (error) {
    categoriesList.innerHTML =
      '<div class="empty">No se pudieron cargar los productos.</div>';
    console.error(error);
    return;
  }

  categoriesList.innerHTML = '';

  if (!categories.length) {
    categoriesList.innerHTML =
      '<div class="empty">Todavía no hay categorías.</div>';
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
        product => (product.category || 'Sin categoría') === name
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
          'Esta categoría todavía no tiene productos.';
        content.append(empty);
      } else {
        matchingProducts.forEach(product => {
          const row = document.createElement('div');
          row.className = 'product-row';

        const info = document.createElement('span');
info.innerHTML = `<strong>${escapeHtml(product.name)}</strong>`;
          row.append(info);
          content.append(row);
        });
      }

      if (id !== null && id !== undefined) {
        const remove = document.createElement('button');
        remove.className = 'remove';
        remove.type = 'button';
        remove.textContent = 'Eliminar categoría';

        remove.addEventListener('click', async () => {
          if (matchingProducts.length) {
            alert(
              'Esta categoría tiene productos asociados. ' +
              'Quitalos o reasignalos antes de eliminarla.'
            );
            return;
          }

          if (!confirm(`¿Eliminar la categoría "${name}"?`)) {
            return;
          }

          try {
            await apiFetch('/api/categories/' + id, {
              method: 'DELETE'
            });

            await loadCategories();

            if (categoryMsg) {
              categoryMsg.textContent = 'Categoría eliminada.';
              categoryMsg.className = 'success';
            }
          } catch (error) {
            alert(
              error.message || 'No se pudo eliminar la categoría.'
            );
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

      if (!groups[category]) groups[category] = [];
      groups[category].push(product);
    });

    const names = Object.keys(groups).sort((a, b) =>
      a.localeCompare(b, 'es')
    );

    if (!names.length) {
      productsEl.innerHTML =
        '<div class="empty">Primero creá una categoría.</div>';
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
          'Todavía no hay productos en esta categoría.';
        details.append(empty);
      }

      groups[category].forEach(product => {
        const row = document.createElement('div');
        row.className = 'product-row';

        const info = document.createElement('span');
        info.innerHTML =
          `<strong>${escapeHtml(product.name)}</strong> · ` +
          `${fmt(product.price)}`;

        const remove = document.createElement('button');
        remove.className = 'remove';
        remove.type = 'button';
        remove.textContent = 'Quitar';

        remove.addEventListener('click', async () => {
          if (!confirm(
            `¿Quitar ${product.name} del catálogo?`
          )) {
            return;
          }

          try {
            await apiFetch('/api/products/' + product.id, {
              method: 'DELETE'
            });

            await loadProducts();
            await loadCategories();
          } catch (error) {
            alert(
              error.message || 'No se pudo quitar el producto.'
            );
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

// -------------------- CREAR CATEGORÍA --------------------

if (categoryForm) {
  categoryForm.addEventListener('submit', async event => {
    event.preventDefault();

    const name = categoryInput?.value.trim();

    if (!name) {
      if (categoryMsg) {
        categoryMsg.textContent =
          'Ingresá un nombre para la categoría.';
        categoryMsg.className = 'error';
      }
      return;
    }

    const submitButton = categoryForm.querySelector(
      'button[type="submit"], input[type="submit"]'
    );

    if (submitButton) submitButton.disabled = true;

    if (categoryMsg) {
      categoryMsg.textContent = 'Creando categoría…';
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
        categoryMsg.textContent =
          '¡Categoría creada con éxito!';
        categoryMsg.className = 'success';
      }

      showCategoriesTab();
    } catch (error) {
      if (categoryMsg) {
        categoryMsg.textContent =
          error.message || 'Error al crear la categoría.';
        categoryMsg.className = 'error';
      }

      console.error('Error al crear categoría:', error);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
} else {
  console.error(
    'No se encontró el formulario #category-form en admin.html.'
  );
}

// -------------------- AGREGAR PRODUCTO --------------------

if (productForm) {
  productForm.addEventListener('submit', async event => {
    event.preventDefault();

    if (productMsg) {
      productMsg.textContent = 'Guardando…';
      productMsg.className = '';
    }

    const nameInput = document.querySelector('#productName');
    const priceInput = document.querySelector('#price');

    const body = {
      category: categorySelect?.value || '',
      name: nameInput?.value.trim() || '',
      price: priceInput?.value || ''
    };

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

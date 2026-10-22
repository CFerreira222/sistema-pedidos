```javascript
const ordersEl = document.querySelector('#orders');
const productsEl = document.querySelector('#products');
const productMsg = document.querySelector('#productMessage');
const categorySelect = document.querySelector('#category');
const categoryForm = document.querySelector('#category-form');
const categoryInput = document.querySelector('#new-category');
const categoryMsg = document.querySelector('#category-message');
const categoriesList = document.querySelector('#categories-list');

const fmt = n =>
  '$ ' + Number(n).toLocaleString('es-UY', {
    maximumFractionDigits: 0
  });

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function getCategoryName(c) {
  return typeof c === 'string' ? c : c.name;
}

async function readResponse(r) {
  try {
    return await r.json();
  } catch {
    return {};
  }
}

// Mantener seleccionada la pestaña actual.
// Compatible con pestañas que usan data-tab y data-panel.
function ```javascript
function showCategoriesTab() {
  const tab = document.querySelector(
    '.admin-tab[data-tab="categories-section"]'
  );
  const panel = document.getElementById('categories-section');

  if (tab && panel) {
    document.querySelectorAll('.admin-tab').forEach(el => {
      const active = el === tab;
      el.classList.toggle('active', active);
      el.setAttribute('aria-selected', String(active));
    });

    document.querySelectorAll('.admin-section').forEach(el => {
      el.hidden = el !== panel;
    });
  }
}
```

    document.querySelectorAll('[data-panel]').forEach(el => {
      el.hidden = el !== panel;
      el.classList.toggle('active', el === panel);
    });
  }
}

// -------------------- PEDIDOS --------------------

async function loadOrders() {
  try {
    const r = await fetch('/api/orders', { cache: 'no-store' });
    if (!r.ok) throw new Error();

    const orders = await r.json();

    if (!orders.length) {
      ordersEl.innerHTML =
        '<div class="empty">Todavía no hay pedidos.</div>';
      return;
    }

    ordersEl.innerHTML = '';

    orders.forEach(o => {
      const card = document.createElement('article');
      card.className = 'order-card';

      const top = document.createElement('div');
      top.className = 'order-top';

      const meta = document.createElement('div');
      meta.innerHTML =
        `<div class="order-id">Pedido #${o.id} · ${escapeHtml(o.customer)}</div>
         <div class="order-time">${escapeHtml(o.created_at)}</div>`;

      const select = document.createElement('select');
      select.className = 'status';

      ['Recibido', 'En preparación', 'Listo', 'Entregado', 'Cancelado']
        .forEach(s => {
          const op = document.createElement('option');
          op.value = s;
          op.textContent = s;
          op.selected = o.status === s;
          select.append(op);
        });

      select.onchange = async () => {
        try {
          const response = await fetch('/api/orders/' + o.id, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: select.value })
          });

          if (!response.ok) throw new Error();
        } catch {
          alert('No se pudo actualizar el estado del pedido.');
        }
      };

      top.append(meta, select);
      card.append(top);

      const list = document.createElement('ul');
      list.className = 'order-items';

      (o.items || []).forEach(i => {
        const li = document.createElement('li');
        li.innerHTML =
          `<span>${i.quantity} × ${escapeHtml(i.name)}</span>
           <strong>${fmt(i.price * i.quantity)}</strong>`;
        list.append(li);
      });

      card.append(list);

      if (o.notes) {
        const note = document.createElement('div');
        note.className = 'notes';
        note.textContent = 'Nota: ' + o.notes;
        card.append(note);
      }

      const bottom = document.createElement('div');
      bottom.className = 'order-bottom';
      bottom.innerHTML =
        `<span class="muted">${(o.items || []).length} línea(s) de productos</span>
         <span class="total">${fmt(o.total)}</span>`;

      card.append(bottom);
      ordersEl.append(card);
    });
  } catch {
    ordersEl.innerHTML =
      '<div class="empty">No se pudo conectar con el servidor.</div>';
  }
}

// -------------------- CATEGORÍAS --------------------

async function fetchCategories() {
  const r = await fetch('/api/categories', { cache: 'no-store' });

  if (!r.ok) {
    throw new Error('No se pudieron cargar las categorías.');
  }

  return await r.json();
}

async function fetchProducts() {
  const r = await fetch('/api/products', { cache: 'no-store' });

  if (!r.ok) {
    throw new Error('No se pudieron cargar los productos.');
  }

  return await r.json();
}

async function loadCategories(selectedName = '') {
  try {
    const categories = await fetchCategories();

    categorySelect.innerHTML =
      '<option value="">Elegí una categoría</option>';

    categories.forEach(c => {
      const name = getCategoryName(c);
      if (!name) return;

      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      option.selected = name === selectedName;
      categorySelect.append(option);
    });

    await renderCategories(categories);
  } catch (err) {
    categoryMsg.textContent = err.message;
    categoryMsg.className = 'error';
  }
}

async function renderCategories(categories) {
  if (!categoriesList) return;

  let products;

  try {
    products = await fetchProducts();
  } catch (err) {
    categoriesList.innerHTML =
      '<div class="empty">No se pudieron cargar los productos.</div>';
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
      const id = typeof category === 'object' ? category.id : null;

      const matchingProducts = products.filter(
        p => (p.category || 'Sin categoría') === name
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
        empty.textContent = 'Esta categoría todavía no tiene productos.';
        content.append(empty);
      } else {
        matchingProducts.forEach(p => {
          const row = document.createElement('div');
          row.className = 'product-row';

          const info = document.createElement('span');
          info.innerHTML =
            `<strong>${escapeHtml(p.name)}</strong> · ${fmt(p.price)}`;

          row.append(info);
          content.append(row);
        });
      }

      // Solo mostrar eliminación si la API devuelve un ID.
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

          if (!confirm(`¿Eliminar la categoría "${name}"?`)) return;

          try {
            const response = await fetch('/api/categories/' + id, {
              method: 'DELETE'
            });

            const data = await readResponse(response);

            if (!response.ok) {
              throw new Error(
                data.error || data.message ||
                'No se pudo eliminar la categoría.'
              );
            }

            await loadCategories();

            categoryMsg.textContent = 'Categoría eliminada.';
            categoryMsg.className = 'success';
          } catch (err) {
            alert(err.message || 'No se pudo eliminar la categoría.');
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
  try {
    const [products, categories] = await Promise.all([
      fetchProducts(),
      fetchCategories()
    ]);

    productsEl.innerHTML = '';

    const groups = {};

    categories.forEach(c => {
      const name = getCategoryName(c);
      if (name) groups[name] = [];
    });

    products.forEach(p => {
      const category = p.category || 'Sin categoría';
      if (!groups[category]) groups[category] = [];
      groups[category].push(p);
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
        empty.textContent = 'Todavía no hay productos en esta categoría.';
        details.append(empty);
      }

      groups[category].forEach(p => {
        const row = document.createElement('div');
        row.className = 'product-row';

        const info = document.createElement('span');
        info.innerHTML =
          `<strong>${escapeHtml(p.name)}</strong> · ${fmt(p.price)}`;

        const remove = document.createElement('button');
        remove.className = 'remove';
        remove.type = 'button';
        remove.textContent = 'Quitar';

        remove.onclick = async () => {
          if (!confirm('¿Quitar ' + p.name + ' del catálogo?')) return;

          try {
            const response = await fetch('/api/products/' + p.id, {
              method: 'DELETE'
            });

            const data = await readResponse(response);

            if (!response.ok) {
              throw new Error(data.error || 'No se pudo quitar el producto.');
            }

            await loadProducts();
            await loadCategories();
          } catch (err) {
            alert(err.message || 'No se pudo quitar el producto.');
          }
        };

        row.append(info, remove);
        details.append(row);
      });

      productsEl.append(details);
    });
  } catch {
    productsEl.innerHTML =
      '<div class="empty">No se pudieron cargar los productos.</div>';
  }
}

// -------------------- CREAR CATEGORÍA --------------------

if (categoryForm) {
  categoryForm.addEventListener('submit', async e => {
    // Evita que el navegador recargue la página.
    e.preventDefault();
    e.stopPropagation();

    const name = categoryInput.value.trim();

    if (!name) {
      categoryMsg.textContent = 'Ingresá un nombre para la categoría.';
      categoryMsg.className = 'error';
      return;
    }

    const submitButton = categoryForm.querySelector(
      'button[type="submit"], input[type="submit"]'
    );

    if (submitButton) submitButton.disabled = true;

    categoryMsg.textContent = 'Creando categoría…';
    categoryMsg.className = '';

    try {
      const r = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });

      const data = await readResponse(r);

      if (!r.ok) {
        throw new Error(
          data.error || data.message ||
          `No se pudo crear la categoría (HTTP ${r.status}).`
        );
      }

      categoryInput.value = '';

      // Actualiza el listado y el selector sin recargar la página.
      await loadCategories(name);
      await loadProducts();

      categoryMsg.textContent = '¡Categoría creada con éxito!';
      categoryMsg.className = 'success';

      // Si la interfaz usa pestañas, permanecer en Categorías.
      showCategoriesTab();
    } catch (err) {
      categoryMsg.textContent =
        err.message || 'Error al crear la categoría.';
      categoryMsg.className = 'error';
      console.error('Error al crear categoría:', err);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
} else {
  console.error('No se encontró el formulario #category-form en admin.html.');
}

// -------------------- AGREGAR PRODUCTO --------------------

const productForm = document.querySelector('#productForm');

if (productForm) {
  productForm.addEventListener('submit', async e => {
    e.preventDefault();

    productMsg.textContent = 'Guardando…';
    productMsg.className = '';

    const body = {
      category: categorySelect.value,
      name: document.querySelector('#productName').value.trim(),
      price: document.querySelector('#price').value
    };

    try {
      const r = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await readResponse(r);

      if (!r.ok) {
        throw new Error(data.error || data.message || 'Error al guardar.');
      }

      productForm.reset();

      productMsg.textContent = 'Producto agregado con éxito.';
      productMsg.className = 'success';

      await loadProducts();
      await loadCategories(body.category);
    } catch (err) {
      productMsg.textContent = err.message || 'Error al guardar.';
      productMsg.className = 'error';
    }
  });
}

// -------------------- ACTUALIZAR --------------------

const refreshButton = document.querySelector('#refresh');

if (refreshButton) {
  refreshButton.onclick = async () => {
    await Promise.all([
      loadOrders(),
      loadProducts(),
      loadCategories()
    ]);
  };
}

// -------------------- INICIO --------------------

loadOrders();
loadProducts();
loadCategories();

setInterval(loadOrders, 3000);
setInterval(loadProducts, 10000);
```

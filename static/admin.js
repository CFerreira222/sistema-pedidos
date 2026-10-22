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
  if (!r.ok) throw new Error('No se pudieron cargar las categorías.');
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

  let products = [];

  try {
    const r = await fetch('/api/products', { cache: 'no-store' });
    if (!r.ok) throw new Error();
    products = await r.json();
  } catch {
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

      const group = document.createElement('details');
      group.className = 'category-group';

      const summary = document.createElement('summary');
      summary.className = 'category-summary';

      const matchingProducts = products.filter(
        p => (p.category || 'Sin categoría') === name
      );

      summary.textContent =
        `${name} (${matchingProducts.length} productos)`;

      group.append(summary);

      const content = document.createElement('div');
      content.className = 'category-products';

      if (!matchingProducts.length) {
        content.innerHTML =
          '<p class="muted">Esta categoría todavía no tiene productos.</p>';
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

            if (!response.ok) {
              let data = {};
              try {
                data = await response.json();
              } catch {}
              throw new Error(
                data.error || 'No se pudo eliminar la categoría.'
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
    const [productsResponse, categories] = await Promise.all([
      fetch('/api/products', { cache: 'no-store' }),
      fetchCategories()
    ]);

    if (!productsResponse.ok) {
      throw new Error('No se pudieron cargar los productos.');
    }

    const products = await productsResponse.json();
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

    if (!names.length || !products.length) {
      if (!names.length) {
        productsEl.innerHTML =
          '<div class="empty">Primero creá una categoría.</div>';
      } else {
        names.forEach(name => {
          const details = document.createElement('details');
          details.className = 'product-group';

          const summary = document.createElement('summary');
          summary.className = 'category-summary';
          summary.textContent = `${name} (0 productos)`;

          const empty = document.createElement('p');
          empty.className = 'muted';
          empty.textContent = 'Todavía no hay productos en esta categoría.';

          details.append(summary, empty);
          productsEl.append(details);
        });
      }
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

            if (!response.ok) throw new Error();

            await loadProducts();
            await loadCategories();
          } catch {
            alert('No se pudo quitar el producto.');
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

categoryForm.addEventListener('submit', async e => {
  e.preventDefault();

  const name = categoryInput.value.trim();
  if (!name) return;

  categoryMsg.textContent = 'Creando categoría…';
  categoryMsg.className = '';

  try {
    const r = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    const data = await r.json();

    if (!r.ok) {
      throw new Error(data.error || 'No se pudo crear la categoría.');
    }

    categoryInput.value = '';
    await loadCategories(name);

    categoryMsg.textContent = '¡Categoría creada con éxito!';
    categoryMsg.className = 'success';
  } catch (err) {
    categoryMsg.textContent =
      err.message || 'Error al crear la categoría.';
    categoryMsg.className = 'error';
  }
});

// -------------------- AGREGAR PRODUCTO --------------------

document.querySelector('#productForm').addEventListener('submit', async e => {
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

    const data = await r.json();

    if (!r.ok) {
      throw new Error(data.error || 'Error al guardar.');
    }

    e.target.reset();

    productMsg.textContent = 'Producto agregado con éxito.';
    productMsg.className = 'success';

    await loadProducts();
    await loadCategories(body.category);
  } catch (err) {
    productMsg.textContent = err.message || 'Error al guardar.';
    productMsg.className = 'error';
  }
});

// -------------------- ACTUALIZAR --------------------

document.querySelector('#refresh').onclick = async () => {
  await Promise.all([
    loadOrders(),
    loadProducts(),
    loadCategories()
  ]);
};

loadOrders();
loadProducts();
loadCategories();

setInterval(loadOrders, 3000);
setInterval(loadProducts, 10000);
```

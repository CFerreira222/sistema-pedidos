
const ordersEl = document.querySelector('#orders');
const productsEl = document.querySelector('#products');
const productMsg = document.querySelector('#productMessage');
const categorySelect = document.querySelector('#category');
const categoryForm = document.querySelector('#category-form');
const categoryInput = document.querySelector('#new-category');
const categoryMsg = document.querySelector('#category-message');

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

async function loadOrders() {
  try {
    const r = await fetch('/api/orders');
    if (!r.ok) throw new Error('Error al cargar pedidos');

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
          const r = await fetch('/api/orders/' + o.id, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: select.value })
          });
          if (!r.ok) throw new Error();
        } catch {
          alert('No se pudo actualizar el estado del pedido.');
        }
      };

      top.append(meta, select);
      card.append(top);

      const list = document.createElement('ul');
      list.className = 'order-items';

      o.items.forEach(i => {
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
        `<span class="muted">${o.items.length} línea(s) de productos</span>
         <span class="total">${fmt(o.total)}</span>`;

      card.append(bottom);
      ordersEl.append(card);
    });
  } catch {
    ordersEl.innerHTML =
      '<div class="empty">No se pudo conectar con el servidor.</div>';
  }
}

async function loadCategories(selectedName = '') {
  try {
    const r = await fetch('/api/categories', { cache: 'no-store' });
    if (!r.ok) throw new Error('No se pudieron cargar las categorías');

    const categories = await r.json();

    categorySelect.innerHTML =
      '<option value="">Elegí una categoría</option>';

    categories.forEach(c => {
      const name = typeof c === 'string' ? c : c.name;
      if (!name) return;

      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      option.selected = name === selectedName;
      categorySelect.append(option);
    });
  } catch (err) {
    categoryMsg.textContent = err.message;
    categoryMsg.className = 'error';
  }
}

async function loadProducts() {
  try {
    const r = await fetch('/api/products', { cache: 'no-store' });
    if (!r.ok) throw new Error('No se pudieron cargar los productos');

    const ps = await r.json();
    productsEl.innerHTML = '';

    if (!ps.length) {
      productsEl.innerHTML =
        '<div class="empty">Todavía no hay productos.</div>';
      return;
    }

    const groups = {};

    ps.forEach(p => {
      const category = p.category || 'Sin categoría';
      if (!groups[category]) groups[category] = [];
      groups[category].push(p);
    });

    Object.keys(groups).sort((a, b) =>
      a.localeCompare(b, 'es')
    ).forEach(category => {
      const section = document.createElement('section');
      section.className = 'product-group';

      const heading = document.createElement('h3');
      heading.textContent = category;
      section.append(heading);

      groups[category].forEach(p => {
        const row = document.createElement('div');
        row.className = 'product-row';

        const info = document.createElement('span');
        info.innerHTML =
          `<strong>${escapeHtml(p.name)}</strong> · ${fmt(p.price)}`;

        const remove = document.createElement('button');
        remove.className = 'remove';
        remove.textContent = 'Quitar';

        remove.onclick = async () => {
          if (!confirm('¿Quitar ' + p.name + ' del catálogo?')) return;

          try {
            const r = await fetch('/api/products/' + p.id, {
              method: 'DELETE'
            });
            if (!r.ok) throw new Error();

            await loadProducts();
          } catch {
            alert('No se pudo quitar el producto.');
          }
        };

        row.append(info, remove);
        section.append(row);
      });

      productsEl.append(section);
    });
  } catch (err) {
    productsEl.innerHTML =
      '<div class="empty">No se pudieron cargar los productos.</div>';
  }
}

// Crear una categoría
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
    categoryMsg.textContent = err.message || 'Error al crear la categoría.';
    categoryMsg.className = 'error';
  }
});

// Agregar un producto
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

    if (!r.ok) throw new Error(data.error || 'Error al guardar.');

    e.target.reset();
    productMsg.textContent = 'Producto agregado con éxito.';
    productMsg.className = 'success';

    await loadProducts();
    await loadCategories();
  } catch (err) {
    productMsg.textContent = err.message || 'Error al guardar.';
    productMsg.className = 'error';
  }
});

document.querySelector('#refresh').onclick = async () => {
  await Promise.all([loadOrders(), loadProducts(), loadCategories()]);
};

loadOrders();
loadProducts();
loadCategories();

setInterval(loadOrders, 3000);
setInterval(loadProducts, 10000);

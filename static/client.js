
const catalog = document.querySelector('#catalog');
const msg = document.querySelector('#message');

let products = [];
let quantities = {};

const fmt = n =>
  '$ ' + Number(n).toLocaleString('es-UY', {
    maximumFractionDigits: 0
  });

async function load() {
  try {
    const response = await fetch('/api/products');

    if (!response.ok) {
      throw new Error('No se pudieron cargar los productos.');
    }

    products = await response.json();
    render();
  } catch (error) {
    msg.textContent = 'No se pudo conectar con el servidor.';
    msg.className = 'error';
  }
}

function render() {
  catalog.innerHTML = '';

  const groups = {};

  products.forEach(product => {
    if (!groups[product.category]) {
      groups[product.category] = [];
    }

    groups[product.category].push(product);
  });

  Object.entries(groups).forEach(([category, groupProducts], index) => {
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

          info.appendChild(name);

      info.append(name, price);

      const controls = document.createElement('div');
      controls.className = 'qty';

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.textContent = '−';
      removeButton.setAttribute('aria-label', 'Quitar ' + product.name);
      removeButton.disabled = quantity === 0;
      removeButton.addEventListener('click', () => {
        setQty(product.id, Math.max(0, quantity - 1));
      });

      const quantityLabel = document.createElement('span');
      quantityLabel.textContent = quantity;

      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.textContent = '+';
      addButton.setAttribute('aria-label', 'Agregar ' + product.name);
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

document.querySelector('#orderForm').addEventListener('submit', async event => {
  event.preventDefault();

  const items = products
    .filter(product => (quantities[product.id] || 0) > 0)
    .map(product => ({
      product_id: product.id,
      quantity: quantities[product.id]
    }));

  if (items.length === 0) {
    msg.textContent = 'Seleccioná al menos un producto.';
    msg.className = 'error';
    return;
  }

  msg.textContent = 'Enviando pedido…';
  msg.className = '';

  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: document.querySelector('#customer').value,
        notes: document.querySelector('#notes').value,
        items
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo enviar el pedido.');
    }

    msg.textContent = `¡Pedido #${data.order_id} enviado correctamente!`;
    msg.className = 'success';

    quantities = {};
    document.querySelector('#orderForm').reset();
    render();
  } catch (error) {
    msg.textContent = error.message;
    msg.className = 'error';
  }
});

load();

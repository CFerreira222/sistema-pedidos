
 // Importación de artículos desde Excel. No borra ni modifica productos existentes.
(() => {
  const providerSelect = document.querySelector('#excel-provider');
  const fileInput = document.querySelector('#excel-file');
  const previewButton = document.querySelector('#excel-preview');
  const confirmButton = document.querySelector('#excel-confirm');
  const status = document.querySelector('#excel-status');

  if (!providerSelect || !fileInput || !previewButton || !confirmButton || !status) {
    return;
  }

  let reviewedFile = null;
  let reviewedProvider = null;
  let busy = false;

  function setStatus(message, success = false) {
    status.textContent = message;
    status.className = success ? 'success' : '';
  }

  function clearReview() {
    reviewedFile = null;
    reviewedProvider = null;
    confirmButton.disabled = true;
    setStatus('');
  }

  fileInput.addEventListener('change', clearReview);
  providerSelect.addEventListener('change', clearReview);

  async function populateProviders() {
    try {
      const response = await fetch('/api/categories', { cache: 'no-store' });
      if (!response.ok) throw new Error('No se pudieron cargar los proveedores.');

      const categories = await response.json();
      const selected = providerSelect.value;
      providerSelect.replaceChildren();

      const automatic = document.createElement('option');
      automatic.value = '';
      automatic.textContent = 'Usar proveedor del Excel';
      providerSelect.append(automatic);

      categories.forEach(category => {
        const name = typeof category === 'string' ? category : category.name;
        if (!name) return;

        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        providerSelect.append(option);
      });

      providerSelect.value = selected;
      if (providerSelect.value !== selected) providerSelect.value = '';
    } catch (error) {
      setStatus(error.message || 'No se pudieron cargar los proveedores.');
    }
  }

  async function submitExcel(preview) {
    const file = fileInput.files?.[0];
    if (!file) throw new Error('Elegí un archivo Excel.');
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      throw new Error('El archivo debe ser .xlsx.');
    }

    const form = new FormData();
    form.append('file', file);
    form.append('category', providerSelect.value);
    form.append('preview', preview ? '1' : '0');

    const response = await fetch('/api/products/import', {
      method: 'POST',
      body: form,
      cache: 'no-store'
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `Error HTTP ${response.status}`);
    }
    return result;
  }

  previewButton.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    previewButton.disabled = true;
    confirmButton.disabled = true;
    setStatus('Analizando el Excel...');

    try {
      const data = await submitExcel(true);
      reviewedFile = fileInput.files?.[0] || null;
      reviewedProvider = providerSelect.value;

      const sample = (data.examples || [])
        .map(item => `• ${item.provider}: ${item.name}`)
        .join('\n');

      setStatus(
        `Artículos leídos: ${data.total}\n` +
        `Nuevos: ${data.new_count}\n` +
        `Repetidos (no se importarán): ${data.duplicates}` +
        (sample ? `\n\nEjemplos:\n${sample}` : '')
      );

      confirmButton.disabled = !data.new_count;
    } catch (error) {
      clearReview();
      setStatus(error.message || 'No se pudo leer el Excel.');
    } finally {
      busy = false;
      previewButton.disabled = false;
    }
  });

  confirmButton.addEventListener('click', async () => {
    if (busy || !reviewedFile || reviewedFile !== fileInput.files?.[0] ||
        reviewedProvider !== providerSelect.value) return;

    if (!window.confirm('¿Agregar los artículos nuevos a la base de datos?')) return;

    busy = true;
    previewButton.disabled = true;
    confirmButton.disabled = true;
    setStatus('Guardando artículos en Supabase...');

    try {
      const data = await submitExcel(false);
      setStatus(
        `Importación terminada. ${data.added} artículos agregados y ` +
        `${data.duplicates} repetidos omitidos. No se borró ningún producto.`,
        true
      );
      reviewedFile = null;

      // Usar la actualización existente del panel administrativo.
      const refreshButton = document.querySelector('#refresh');
      if (refreshButton) refreshButton.click();
      await populateProviders();
    } catch (error) {
      setStatus(error.message || 'No se pudo importar.');
    } finally {
      busy = false;
      previewButton.disabled = false;
    }
  });

  populateProviders();

  // Actualizar opciones después de crear nuevos proveedores en Administración.
  document.querySelector('#category-form')?.addEventListener('submit', () => {
    setTimeout(populateProviders, 1200);
  });
})();

const state = { products: [], movements: [] };
document.querySelectorAll('option[value="Piso 2"]').forEach(option => { option.value = 'Piso 5'; option.textContent = 'Piso 5'; });
const productLocationSelect = document.querySelector('#product-form-modern select[name="location"]');
if (productLocationSelect) {
    const productLocationInput = document.createElement('input');
    productLocationInput.name = 'location';
    productLocationInput.value = 'Locker 1';
    productLocationInput.placeholder = 'Escribe la locacion';
    productLocationSelect.replaceWith(productLocationInput);
}
const money = value => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD' }).format(value);
const date = value => new Date(value.replace(' ', 'T') + 'Z').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));

async function api(path, options) {
    const response = await fetch(path, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo completar la operacion.');
    return data;
}

function showToast(message, isError = false) {
    const toast = document.querySelector('#toast');
    toast.textContent = message;
    toast.className = `toast show${isError ? ' error' : ''}`;
    setTimeout(() => { toast.className = 'toast'; }, 3000);
}

function renderProducts() {
    document.querySelector('#view-products thead th:nth-child(5)').textContent = 'Piso';
    document.querySelector('#view-products thead th:nth-child(6)').textContent = 'Locacion';
    const rows = state.products.map(product => {
        const low = product.stock <= product.min_stock;
        return `<tr><td><b class="sku">${escapeHtml(product.id)}</b></td><td><strong>${escapeHtml(product.name)}</strong></td><td>${escapeHtml(product.category)}</td><td><strong>${product.stock}</strong> uds.</td><td>${escapeHtml(product.floor || '-')}</td><td>${escapeHtml(product.location || '-')}</td><td><span class="status ${low ? 'warning' : 'ok'}"><i></i>${low ? 'Stock bajo' : 'En stock'}</span></td></tr>`;
    }).join('');
    document.querySelector('#products-table').innerHTML = rows || '<tr><td colspan="7" class="empty-cell">No hay productos registrados.</td></tr>';
    const inventoryRows = state.products.map(product => {
        const low = product.stock <= product.min_stock;
        return `<tr><td><strong>${escapeHtml(product.id)}</strong></td><td>${escapeHtml(product.source_sheet || '-')}</td><td>${escapeHtml(product.item || '-')}</td><td><strong>${escapeHtml(product.name)}</strong></td><td>${escapeHtml(product.brand || '-')}</td><td>${escapeHtml(product.model || '-')}</td><td>${escapeHtml(product.part_number || '-')}</td><td><strong>${product.stock}</strong> uds.</td><td>${escapeHtml(product.location || '-')}</td><td>${escapeHtml(product.position || '-')}</td><td>${escapeHtml(product.observation || '-')}</td><td><span class="status ${low ? 'warning' : 'ok'}"><i></i>${low ? 'Reponer' : 'Saludable'}</span></td></tr>`;
    }).join('');
    document.querySelector('#inventory-table').innerHTML = inventoryRows;
    document.querySelector('#low-stock-list').innerHTML = state.products.filter(product => product.stock <= product.min_stock).map(product => `<div class="low-item"><span class="product-dot">${escapeHtml(product.name.charAt(0))}</span><div><strong>${escapeHtml(product.name)}</strong><small>${product.stock} de ${product.min_stock} unidades</small></div><span class="low-number">${product.stock}</span></div>`).join('') || '<div class="empty-state">Todo el inventario esta en niveles saludables.</div>';
    const healthy = state.products.filter(product => product.stock > product.min_stock).length;
    document.querySelector('#inventory-status').textContent = `${healthy} de ${state.products.length} productos saludables`;
    document.querySelector('#inventory-progress').style.width = `${state.products.length ? (healthy / state.products.length) * 100 : 0}%`;
}

function renderMovements() {
    const rows = state.movements.map(move => `<tr><td><strong>${escapeHtml(move.product_name)}</strong><small class="table-sub">${escapeHtml(move.sku)}</small></td><td><span class="movement ${move.movement_type === 'Entrada' ? 'in' : 'out'}"><i>${move.movement_type === 'Entrada' ? '↑' : '↓'}</i>${move.movement_type}</span></td><td><strong>${move.quantity}</strong> uds.</td><td>${date(move.created_at)}</td><td>${escapeHtml(move.note || 'Sin nota')}</td></tr>`).join('');
    document.querySelector('#movements-table').innerHTML = rows || '<tr><td colspan="5" class="empty-cell">No hay movimientos.</td></tr>';
    document.querySelector('#recent-movements').innerHTML = state.movements.slice(0, 4).map(move => `<tr><td><strong>${escapeHtml(move.product_name)}</strong><small class="table-sub">${escapeHtml(move.sku)}</small></td><td><span class="movement ${move.movement_type === 'Entrada' ? 'in' : 'out'}"><i>${move.movement_type === 'Entrada' ? '↑' : '↓'}</i>${move.movement_type}</span></td><td><strong>${move.quantity}</strong> uds.</td><td>${date(move.created_at)}</td><td>${escapeHtml(move.note || 'Sin nota')}</td></tr>`).join('');
}

async function loadData() {
    const [dashboard, products, movements] = await Promise.all([api('/api/dashboard'), api('/api/products'), api('/api/movements')]);
    state.products = products;
    state.movements = movements;
    document.querySelector('#metric-products').textContent = dashboard.products;
    document.querySelector('#metric-units').textContent = dashboard.units.toLocaleString('es-MX');
    document.querySelector('#metric-low').textContent = dashboard.low_stock;
    renderProducts();
    renderMovements();
}

function navigate(viewName) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === viewName));
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === `view-${viewName}`));
    const nav = document.querySelector(`[data-view="${viewName}"]`);
    document.querySelector('#page-name').textContent = nav ? nav.lastElementChild.textContent : 'Dashboard';
    document.querySelector('#sidebar').classList.remove('open');
}

function openModal(type) {
    if (type === 'product') {
        document.querySelector('#product-modal-modern').classList.add('open');
        return;
    }
    document.querySelector('#modal-backdrop').classList.add('open');
    document.querySelector('#product-form-wrap').hidden = type !== 'product';
    document.querySelector('#movement-form-wrap').hidden = type !== 'movement';
    if (type === 'movement') {
        const brands = ['DEXON', 'RL', 'SATEC', 'PFENIX CONTAC', 'ETRELEC', 'KYAND', 'ABB'];
        let brandField = document.querySelector('#movement-brand');
        if (!brandField) {
            const movementDetails = document.createElement('div');
            movementDetails.className = 'form-grid movement-fields';
            movementDetails.innerHTML = '<label>Marca<select name="brand" id="movement-brand"><option value="">Selecciona una marca</option></select></label><label>Piso<select name="floor" id="movement-floor"><option value="Piso 1">Piso 1</option><option value="Piso 5">Piso 5</option></select></label><label>Locación<input name="location" id="movement-location" value="Locker 1" placeholder="Escribe la locacion"></label>';
            const noteField = document.querySelector('#movement-form textarea[name="note"]').parentElement;
            noteField.before(movementDetails);
            brandField = movementDetails.querySelector('#movement-brand');
        }
        brandField.innerHTML = '<option value="">Selecciona una marca</option>' + brands.map(brand => `<option value="${escapeHtml(brand)}">${escapeHtml(brand)}</option>`).join('');
        document.querySelector('#movement-floor').value = 'Piso 1';
        document.querySelector('#movement-location').value = 'Locker 1';
        document.querySelector('#movement-date').value = new Date().toISOString().slice(0, 10);
    }
}
function closeModal() { document.querySelector('#modal-backdrop').classList.remove('open'); document.querySelector('#product-modal-modern').classList.remove('open'); }

function filterProducts(query) {
    const term = query.toLowerCase();
    document.querySelectorAll('#products-table tr').forEach(row => { row.hidden = !row.textContent.toLowerCase().includes(term); });
}
function renderSearch(query) {
    const results = state.products.filter(product => `${product.name} ${product.sku} ${product.category} ${product.brand || product.group || ''}`.toLowerCase().includes(query.toLowerCase()));
    document.querySelector('#search-results').innerHTML = query ? results.map(product => `<div class="search-result"><span class="product-dot">${escapeHtml(product.name.charAt(0))}</span><div><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku)} · ${escapeHtml(product.category)}</small></div><b>${product.stock} uds.</b></div>`).join('') || '<div class="empty-state">No encontramos resultados.</div>' : '<div class="empty-state">Empieza a escribir para buscar productos.</div>';
}

document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => navigate(item.dataset.view)));
document.querySelectorAll('[data-view-link]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.viewLink)));
document.querySelectorAll('[data-open-modal]').forEach(button => button.addEventListener('click', () => openModal(button.dataset.openModal)));
document.querySelector('#modal-close').addEventListener('click', closeModal);
document.querySelector('#product-modal-close').addEventListener('click', closeModal);
document.querySelector('#modal-backdrop').addEventListener('click', event => { if (event.target.id === 'modal-backdrop') closeModal(); });
document.querySelector('#product-modal-modern').addEventListener('click', event => { if (event.target.id === 'product-modal-modern') closeModal(); });
document.querySelector('#mobile-menu').addEventListener('click', () => document.querySelector('#sidebar').classList.toggle('open'));
document.querySelector('#product-filter').addEventListener('input', event => filterProducts(event.target.value));
document.querySelector('#global-search').addEventListener('input', event => renderSearch(event.target.value));

document.querySelector('#product-form-modern').addEventListener('submit', async event => {
    event.preventDefault();
    try { await api('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); event.target.reset(); closeModal(); showToast('Producto guardado correctamente.'); await loadData(); navigate('products'); } catch (error) { showToast(error.message, true); }
});
document.querySelector('#movement-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
        const data = Object.fromEntries(new FormData(event.target));
        const product = state.products.find(item => item.sku.toLowerCase() === data.product_sku.trim().toLowerCase());
        if (!product) throw new Error('El codigo del producto no existe.');
        data.product_id = product.id;
        data.quantity = Number(data.quantity);
        await api('/api/movements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        event.target.reset();
        closeModal();
        showToast('Movimiento registrado correctamente.');
        await loadData();
        navigate('movements');
    } catch (error) { showToast(error.message, true); }
});
document.querySelector('#export-button').addEventListener('click', async () => { try { const response = await fetch('/api/export'); if (!response.ok) throw new Error('No se pudo exportar el inventario.'); const blob = await response.blob(); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `inventario-nakama-soluciones-${new Date().toISOString().slice(0, 10)}.xlsx`; link.click(); URL.revokeObjectURL(link.href); showToast('Excel exportado correctamente.'); } catch (error) { showToast(error.message, true); } });
document.querySelector('#report-button').addEventListener('click', () => showToast('Reporte generado. Puedes consultar el inventario y exportarlo en Excel.'));
loadData().catch(error => showToast(error.message, true));

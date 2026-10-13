const state = { products: [], inventoryProducts: [], movements: [], role: 'public', adminConfigured: false, canViewDashboard: true };
let editingMovementId = null;
let selectedMovementProductId = null;
let activeMovementSuggestionIndex = -1;
const movementProductInput = document.querySelector('#movement-sku');
document.querySelector('#movement-form [name="description"]')?.closest('label')?.remove();
const movementProductSuggestions = document.createElement('div');
movementProductSuggestions.id = 'movement-product-suggestions';
movementProductSuggestions.className = 'movement-product-suggestions';
movementProductSuggestions.setAttribute('role', 'listbox');
movementProductSuggestions.hidden = true;
if (movementProductInput) {
    movementProductInput.removeAttribute('list');
    movementProductInput.setAttribute('role', 'combobox');
    movementProductInput.setAttribute('aria-autocomplete', 'list');
    movementProductInput.setAttribute('aria-controls', movementProductSuggestions.id);
    movementProductInput.setAttribute('aria-expanded', 'false');
    movementProductInput.closest('label').classList.add('movement-product-field');
    movementProductInput.after(movementProductSuggestions);
    document.querySelector('#movement-product-options')?.remove();
}
const productBrandSelect = document.querySelector('#product-form-modern select[name="brand"]');
if (productBrandSelect) {
    const productBrandInput = document.createElement('input');
    productBrandInput.name = 'brand';
    productBrandInput.placeholder = 'Escribe la marca';
    productBrandSelect.replaceWith(productBrandInput);
}
const money = value => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD' }).format(value);
const date = value => new Date(value.replace(' ', 'T') + 'Z').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
const longDate = value => new Date(`${String(value).slice(0, 10)}T00:00:00Z`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
const inventoryGroup = product => String(product.observation || product.source_sheet || product.group || product.category || '').trim();
const inventoryFilterState = { type: '', brand: '', location: '', query: '' };
let searchInventoryRefreshTimer;
let searchInventoryRequestId = 0;

function setupInventoryFilters() {
    const tableWrap = document.querySelector('.inventory-table-wrap');
    if (!tableWrap || document.querySelector('#inventory-filters')) return;
    tableWrap.insertAdjacentHTML('beforebegin', '<div class="inventory-filters" id="inventory-filters"><label>Buscar producto o modelo<input type="search" data-inventory-filter="query" placeholder="Escribe producto o modelo..."></label><label>Grupo<select data-inventory-filter="type"><option value="">Todos</option></select></label><label>Marca<select data-inventory-filter="brand"><option value="">Todas</option></select></label><label>Locker<select data-inventory-filter="location"><option value="">Todos</option></select></label></div>');
    document.querySelectorAll('[data-inventory-filter]').forEach(filter => filter.addEventListener('change', event => {
        inventoryFilterState[event.target.dataset.inventoryFilter] = event.target.value;
        renderProducts();
    }));
    document.querySelector('[data-inventory-filter="query"]').addEventListener('input', event => {
        inventoryFilterState.query = event.target.value;
        renderProducts();
    });
}

function updateInventoryFilterOptions() {
    const inventoryProducts = state.products;
    const options = {
        type: [...new Set(inventoryProducts.map(inventoryGroup).filter(Boolean))].sort((first, second) => first.localeCompare(second, 'es')),
        brand: [...new Set(inventoryProducts.map(product => product.brand).filter(Boolean))].sort((first, second) => first.localeCompare(second, 'es')),
        location: [...new Set(inventoryProducts.map(product => product.location).filter(Boolean))].sort((first, second) => first.localeCompare(second, 'es')),
    };
    Object.entries(options).forEach(([filterName, values]) => {
        const filter = document.querySelector(`[data-inventory-filter="${filterName}"]`);
        if (!filter) return;
        const currentValue = inventoryFilterState[filterName];
        const defaultLabel = filterName === 'brand' ? 'Todas' : 'Todos';
        filter.innerHTML = `<option value="">${defaultLabel}</option>` + values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
        filter.value = values.includes(currentValue) ? currentValue : '';
        inventoryFilterState[filterName] = filter.value;
    });
}

async function api(path, options) {
    const response = await fetch(path, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo completar la operacion.');
    return data;
}

function showToast(message, isError = false, isWarning = false) {
    const toast = document.querySelector('#toast');
    toast.textContent = message;
    toast.className = `toast show${isError ? ' error' : ''}${isWarning ? ' warning' : ''}`;
    setTimeout(() => { toast.className = 'toast'; }, 3000);
}

function updateRoleInterface() {
    const isAdmin = state.role === 'admin';
    document.body.dataset.role = state.role;
    document.body.dataset.hideDashboard = String(!state.canViewDashboard);
    const dashboardNav = document.querySelector('[data-view="dashboard"]');
    if (dashboardNav) dashboardNav.hidden = !state.canViewDashboard;
    if (!state.canViewDashboard && document.querySelector('#view-dashboard').classList.contains('active')) {
        navigate('inventory');
    }
    document.querySelector('#role-toggle').textContent = state.role === 'visitor' ? 'Cerrar sesión visitante' : isAdmin ? 'Cerrar sesión admin' : 'Entrar como admin';
    document.querySelectorAll('[data-open-modal], #import-button, #edit-profile-button, #modal-backdrop, #product-modal-modern').forEach(element => { element.dataset.adminOnly = ''; });
    const productActionsHeader = document.querySelector('#view-products thead th:last-child');
    if (productActionsHeader) productActionsHeader.dataset.adminOnly = '';
    document.querySelectorAll('[data-admin-only]').forEach(element => { element.hidden = !isAdmin; });
    if (isAdmin) localStorage.setItem('inventoryProfileArea', 'Logística');
    renderProfileName();
}

function getGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Buenos días';
    if (hour >= 12 && hour < 18) return 'Buenas tardes';
    return 'Buenas noches';
}

function getProfileName() {
    const savedName = localStorage.getItem('inventoryProfileName');
    if (!savedName || savedName.trim().toLocaleLowerCase('es') === 'admin general') {
        localStorage.setItem('inventoryProfileName', 'Logística');
        return 'Logística';
    }
    return savedName;
}

function renderGreeting() {
    const dashboardHeading = document.querySelector('#view-dashboard .page-heading h1');
    if (!dashboardHeading) return;
    const isVisitor = state.role !== 'admin';
    const greeting = getGreeting();
    if (isVisitor) {
        dashboardHeading.innerHTML = `${greeting} <span>👋</span>`;
        return;
    }
    const profileName = getProfileName();
    dashboardHeading.innerHTML = `${greeting}, <span id="dashboard-profile-name">${profileName}</span> <span>👋</span>`;
}

function renderProfileName() {
    const profileName = getProfileName();
    const savedProfileArea = localStorage.getItem('inventoryProfileArea');
    const profileArea = !savedProfileArea || savedProfileArea === 'Administración' ? 'Logística' : savedProfileArea;
    if (profileArea !== savedProfileArea) localStorage.setItem('inventoryProfileArea', profileArea);
    const initials = profileName.split(/\s+/).filter(Boolean).map(word => word[0]).join('').slice(0, 2).toUpperCase();
    document.querySelector('#profile-name').textContent = profileName;
    document.querySelector('#profile-area').textContent = `Área: ${profileArea}`;
    document.querySelector('#settings-profile-name').textContent = profileName;
    document.querySelector('#settings-profile-area').textContent = profileArea;
    document.querySelector('#profile-initials').textContent = initials || 'L';
    document.querySelectorAll('.avatar, .top-avatar').forEach(avatar => { avatar.textContent = initials || 'L'; });
    renderGreeting();
}

function editProfileName() {
    const currentName = getProfileName();
    const currentArea = localStorage.getItem('inventoryProfileArea') || 'Logística';
    const newName = window.prompt('Nombre de la persona administradora:', currentName);
    if (newName === null) return;
    const trimmedName = newName.trim();
    if (!trimmedName) {
        showToast('Escribe un nombre válido.', true);
        return;
    }
    const newArea = window.prompt('Área de la persona administradora:', currentArea);
    if (newArea === null) return;
    const trimmedArea = newArea.trim();
    if (!trimmedArea) {
        showToast('Escribe un área válida.', true);
        return;
    }
    localStorage.setItem('inventoryProfileName', trimmedName);
    localStorage.setItem('inventoryProfileArea', trimmedArea);
    renderProfileName();
    showToast('Perfil actualizado.');
}

function renderProducts() {
    setupInventoryFilters();
    updateInventoryFilterOptions();
    document.querySelector('#view-products thead th:nth-child(5)').textContent = 'Piso';
    document.querySelector('#view-products thead th:nth-child(6)').textContent = 'Locacion';
    const rows = state.products.map(product => {
        const low = product.stock <= product.min_stock;
        const actions = state.role === 'admin' ? `<td><button class="text-button delete-product" type="button" data-delete-product="${escapeHtml(product.id)}" title="Eliminar producto">Eliminar</button></td>` : '';
        return `<tr><td><strong>${escapeHtml(product.name)}</strong></td><td>${escapeHtml(product.brand || '-')}</td><td>${escapeHtml(product.category)}</td><td><strong>${product.stock}</strong> uds.</td><td>${escapeHtml(product.floor || '-')}</td><td>${escapeHtml(product.location || '-')}</td><td><span class="status ${low ? 'warning' : 'ok'}"><i></i>${low ? 'Falta stock' : 'En buen estado'}</span></td>${actions}</tr>`;
    }).join('');
    document.querySelector('#products-table').innerHTML = rows || `<tr><td colspan="${state.role === 'admin' ? 8 : 7}" class="empty-cell">No hay productos registrados.</td></tr>`;
    const searchTerm = inventoryFilterState.query.trim().toLocaleLowerCase('es');
    const filteredProducts = state.products.filter(product => {
        const matchesSearch = !searchTerm || `${product.name || ''} ${product.model || ''}`.toLocaleLowerCase('es').includes(searchTerm);
        return matchesSearch && (!inventoryFilterState.type || inventoryGroup(product) === inventoryFilterState.type) && (!inventoryFilterState.brand || product.brand === inventoryFilterState.brand) && (!inventoryFilterState.location || product.location === inventoryFilterState.location);
    });
    const inventoryRows = filteredProducts.map(product => {
        const low = product.stock <= product.min_stock;
        const groupValue = inventoryGroup(product);
        const editable = (field, value, display = value) => state.role === 'admin'
            ? `<button class="inline-cell-edit" type="button" data-inline-edit="${escapeHtml(product.id)}" data-inline-field="${field}" title="Haz clic para editar" aria-label="Editar ${field} de ${escapeHtml(product.name)}">${escapeHtml(display || '-')}</button>`
            : escapeHtml(display === null || display === undefined || display === '' ? '-' : display);
        return `<tr><td>${editable('group', groupValue)}</td><td>${editable('name', product.name)}</td><td>${editable('brand', product.brand)}</td><td>${editable('model', product.model)}</td><td>${editable('part_number', product.part_number)}</td><td>${editable('stock', product.stock, `${product.stock} uds.`)}</td><td>${editable('location', product.location)}</td><td>${editable('position', product.position)}</td><td><span class="status ${low ? 'warning' : 'ok'}"><i></i>${low ? 'Falta stock' : 'En buen estado'}</span></td></tr>`;
    }).join('');
    document.querySelector('#inventory-table').innerHTML = inventoryRows || '<tr><td colspan="9" class="empty-cell">No se encontraron productos o modelos.</td></tr>';
    const lowInventoryProducts = state.products.filter(product => product.stock <= product.min_stock);
    document.querySelector('#low-stock-list').innerHTML = lowInventoryProducts.map(product => {
        const detail = [product.model, product.location, product.position].filter(Boolean).join(' · ');
        return `<div class="low-item"><span class="product-dot">${escapeHtml((product.name || '?').charAt(0))}</span><div><strong>${escapeHtml(product.name || 'Producto sin nombre')}</strong><small>${product.stock} de ${product.min_stock} unidades${detail ? ` · ${escapeHtml(detail)}` : ''}</small></div><span class="low-number">${product.stock}</span></div>`;
    }).join('') || '<div class="empty-state">Todo el inventario esta en niveles saludables.</div>';
    const healthy = state.products.filter(product => product.stock > product.min_stock).length;
    document.querySelector('#inventory-status').textContent = `${healthy} de ${state.products.length} productos en buen estado`;
    document.querySelector('#inventory-progress').style.width = `${state.products.length ? (healthy / state.products.length) * 100 : 0}%`;
}

async function startInlineInventoryEdit(button) {
    const product = state.products.find(item => String(item.id) === button.dataset.inlineEdit);
    const field = button.dataset.inlineField;
    if (!product || !field) return;
    const values = {
        group: product.observation || product.source_sheet || product.group || product.category || '',
        item: product.item || '',
        name: product.name || '',
        brand: product.brand || '',
        model: product.model || '',
        part_number: product.part_number || '',
        stock: product.stock ?? 0,
        location: product.location || '',
        position: product.position || '',
        observation: '',
    };
    const originalValue = String(values[field] ?? '');
    const input = document.createElement('input');
    input.className = 'inline-cell-input';
    input.type = field === 'stock' ? 'number' : 'text';
    input.value = originalValue;
    input.setAttribute('aria-label', `Editar ${field} de ${product.name}`);
    if (field === 'stock') {
        input.min = '0';
        input.step = '1';
    }
    if (field === 'name') input.required = true;
    button.replaceWith(input);
    input.focus();
    if (input.type === 'text') input.select();

    let cancelled = false;
    let saving = false;
    input.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            cancelled = true;
            input.blur();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            input.blur();
        }
    });
    input.addEventListener('blur', async () => {
        if (saving) return;
        if (cancelled || !input.isConnected) {
            renderProducts();
            return;
        }
        const rawValue = input.value.trim();
        if (field === 'stock' && !rawValue) {
            showToast('Escribe una cantidad válida.', true);
            renderProducts();
            return;
        }
        const value = field === 'stock' ? Number(rawValue) : rawValue;
        if (field === 'name' && !value) {
            showToast('El nombre del producto es obligatorio.', true);
            renderProducts();
            return;
        }
        if (field === 'stock' && (!Number.isInteger(value) || value < 0)) {
            showToast('La cantidad debe ser un entero igual o mayor que cero.', true);
            renderProducts();
            return;
        }
        if (String(value) === originalValue) {
            renderProducts();
            return;
        }
        saving = true;
        try {
            const updatedFields = { [field]: value };
            if (field === 'group') updatedFields.observation = '';
            await api(`/api/products/${product.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedFields),
            });
            showToast('Cambio guardado correctamente.');
            await loadData();
        } catch (error) {
            showToast(error.message, true);
            renderProducts();
        }
    });
}

function renderMovements() {
    const rows = state.movements.map(move => {
        const actions = state.role === 'admin' ? `<td class="movement-action-cell"><div class="movement-row-actions"><button class="text-button edit-movement" type="button" data-edit-movement="${move.id}" title="Editar movimiento">Editar</button><button class="text-button delete-movement" type="button" data-delete-movement="${move.id}" title="Eliminar movimiento">Eliminar</button></div></td>` : '';
        return `<tr><td><strong>${escapeHtml(move.product_name)}</strong></td><td>${escapeHtml(move.model || '-')}</td><td class="movement-part-number" title="${escapeHtml(move.part_number || '')}">${escapeHtml(move.part_number || '-')}</td><td>${escapeHtml(move.brand || '-')}</td><td><span class="movement ${move.movement_type === 'Entrada' ? 'in' : 'out'}"><i>${move.movement_type === 'Entrada' ? '↑' : '↓'}</i>${escapeHtml(move.movement_type)}</span></td><td><strong>${move.quantity} uds.</strong></td><td class="movement-date">${longDate(move.created_at)}</td><td>${escapeHtml(move.inventory_group || move.group || '-')}</td><td class="movement-project">${escapeHtml(move.project || '-')}</td><td class="movement-note-cell">${escapeHtml(move.note || 'Sin nota')}</td>${actions}</tr>`;
    }).join('');
    document.querySelector('#movements-table').innerHTML = rows || `<tr><td colspan="${state.role === 'admin' ? 11 : 10}" class="empty-cell">No hay movimientos.</td></tr>`;
    document.querySelector('#recent-movements').innerHTML = state.movements.slice(0, 4).map(move => `<tr><td><strong>${escapeHtml(move.product_name)}</strong><small class="table-sub">${escapeHtml(move.sku)}</small></td><td><span class="movement ${move.movement_type === 'Entrada' ? 'in' : 'out'}"><i>${move.movement_type === 'Entrada' ? '↑' : '↓'}</i>${move.movement_type}</span></td><td><strong>${move.quantity}</strong> uds.</td><td>${date(move.created_at)}</td><td>${escapeHtml(move.note || 'Sin nota')}</td></tr>`).join('');
}

let reportsFiltersInitialized = false;
function renderReports() {
    const monthSelect = document.querySelector('#report-month');
    const yearSelect = document.querySelector('#report-year');
    const now = new Date();
    const years = [...new Set([...state.movements.map(move => {
        const raw = String(move.created_at || '');
        const match = raw.match(/^(\d{4})/);
        return match ? Number(match[1]) : null;
    }).filter(Boolean), now.getFullYear()])].sort((a, b) => b - a);
    const previousYear = yearSelect.value;
    yearSelect.innerHTML = '<option value="">Todos los a\u00f1os</option>' + years.map(year => `<option value="${year}">${year}</option>`).join('');
    yearSelect.value = !reportsFiltersInitialized ? String(now.getFullYear()) : (years.includes(Number(previousYear)) ? previousYear : '');
    if (!reportsFiltersInitialized && !monthSelect.value) monthSelect.value = String(now.getMonth() + 1);
    reportsFiltersInitialized = true;

    const selectedMonth = Number(monthSelect.value) || null;
    const selectedYear = Number(yearSelect.value) || null;
    const monthName = selectedMonth
        ? new Intl.DateTimeFormat('es-PE', { month: 'long' }).format(new Date(2000, selectedMonth - 1, 1))
        : 'todos los meses';
    const formatCount = value => Math.round(value).toLocaleString('es-PE');
    const parseMovementDate = value => {
        if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
        const raw = String(value || '').trim();
        const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoDate) return new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]));
        const localizedDate = raw.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
        if (localizedDate) return new Date(Number(localizedDate[3]), Number(localizedDate[2]) - 1, Number(localizedDate[1]));
        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    };
    const matchingMovements = state.movements.filter(move => {
        const movementDate = parseMovementDate(move.created_at);
        return movementDate && (!selectedMonth || movementDate.getMonth() + 1 === selectedMonth) && (!selectedYear || movementDate.getFullYear() === selectedYear);
    });
    const monthEntries = matchingMovements.filter(move => move.movement_type === 'Entrada').reduce((total, move) => total + Number(move.quantity || 0), 0);
    const monthExits = matchingMovements.filter(move => move.movement_type === 'Salida').reduce((total, move) => total + Number(move.quantity || 0), 0);
    const currentStock = state.inventoryProducts.reduce((total, product) => total + Number(product.stock || 0), 0);
    const estimatedOpeningStock = Math.max(0, currentStock - monthEntries + monthExits);
    const averageStock = (estimatedOpeningStock + currentStock) / 2;
    const turnover = averageStock > 0 ? monthExits / averageStock : 0;
    document.querySelector('#report-turnover').textContent = `${turnover.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`;
    document.querySelector('#report-turnover-note').textContent = 'Salidas del periodo / stock promedio estimado';
    document.querySelector('#report-entries').textContent = formatCount(monthEntries);
    document.querySelector('#report-exits').textContent = formatCount(monthExits);
    const periodName = selectedMonth ? monthName.charAt(0).toLocaleUpperCase('es-PE') + monthName.slice(1) : 'Periodo';
    document.querySelector('#report-entries-label').textContent = `Entradas de ${periodName}`;
    document.querySelector('#report-exits-label').textContent = `Salidas de ${periodName}`;
    document.querySelector('#report-updated-at').textContent = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(now);

    const entries = monthEntries;
    const exits = monthExits;
    const movementTotal = entries + exits;
    const movementMaximum = Math.max(entries, exits, 1);
    const entryPercent = movementTotal ? Math.round(entries / movementTotal * 100) : 0;
    const exitPercent = movementTotal ? 100 - entryPercent : 0;
    document.querySelector('#movement-chart').innerHTML = [['Entradas', entries], ['Salidas', exits]].map(([label, value]) => `<div class="bar-row"><span>${label}</span><div class="bar-track"><i class="bar-fill" style="width: ${(value / movementMaximum) * 100}%"></i></div><strong>${formatCount(value)}</strong></div>`).join('') + `<div class="movement-breakdown"><div class="movement-ring" style="--entry-share:${entryPercent}%"><strong>${formatCount(movementTotal)}</strong><small>Total de<br>unidades</small></div><div class="movement-legend"><div><i></i><span>Entradas</span><strong>${formatCount(entries)} <small>(${entryPercent}%)</small></strong></div><div><i></i><span>Salidas</span><strong>${formatCount(exits)} <small>(${exitPercent}%)</small></strong></div></div></div>`;

    const stockByGroup = state.products.reduce((groups, product) => {
        const group = product.group || product.category || 'Sin grupo';
        groups[group] = (groups[group] || 0) + Number(product.stock || 0);
        return groups;
    }, {});
    const groupEntries = Object.entries(stockByGroup).sort((first, second) => second[1] - first[1]);
    const groupMaximum = Math.max(...groupEntries.map(([, value]) => value), 1);
    document.querySelector('#group-chart').innerHTML = groupEntries.length ? groupEntries.map(([label, value]) => {
        const share = currentStock ? Math.round(value / currentStock * 100) : 0;
        return `<div class="bar-row"><span>${escapeHtml(label)}</span><div class="bar-track"><i class="bar-fill" style="width: ${(value / groupMaximum) * 100}%"></i></div><strong>${formatCount(value)}</strong><small>${share}%</small></div>`;
    }).join('') : '<div class="empty-state">No hay existencias registradas.</div>';
}

document.querySelector('#report-month').addEventListener('change', renderReports);
document.querySelector('#report-year').addEventListener('change', renderReports);

function renderActivityChart() {
    const axis = document.querySelector('#activity-axis');
    const bars = document.querySelector('#activity-bars');
    const period = document.querySelector('#activity-period')?.value || '7';
    if (!axis || !bars) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const toKey = value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    const lastDay = toKey(today);
    const firstDate = new Date(today);
    if (period === 'month') firstDate.setDate(1);
    else firstDate.setDate(firstDate.getDate() - 6);

    const days = [];
    for (const day = new Date(firstDate); day <= today; day.setDate(day.getDate() + 1)) {
        days.push({ key: toKey(day), entries: 0, exits: 0, label: period === 'month'
            ? String(day.getDate())
            : new Intl.DateTimeFormat('es', { weekday: 'short' }).format(day).replace('.', '') });
    }
    const byDate = new Map(days.map(day => [day.key, day]));
    state.movements.forEach(move => {
        const key = String(move.created_at || '').slice(0, 10);
        if (key < toKey(firstDate) || key > lastDay) return;
        const day = byDate.get(key);
        if (!day) return;
        if (move.movement_type === 'Entrada') day.entries += Number(move.quantity || 0);
        if (move.movement_type === 'Salida') day.exits += Number(move.quantity || 0);
    });

    const peak = Math.max(0, ...days.flatMap(day => [day.entries, day.exits]));
    const step = peak > 0 ? Math.max(1, Math.ceil(peak / 4)) : 1;
    const scale = step * 4;
    axis.innerHTML = [4, 3, 2, 1, 0].map(tick => `<span>${tick * step}</span>`).join('');
    bars.dataset.monthView = period === 'month' ? 'true' : 'false';
    bars.innerHTML = days.map(day => {
        const entryHeight = day.entries ? Math.max(1, day.entries / scale * 100) : 0;
        const exitHeight = day.exits ? Math.max(1, day.exits / scale * 100) : 0;
        return `<div class="bar-set"><i title="Entradas: ${day.entries}" style="height: ${entryHeight}%"></i><i class="out" title="Salidas: ${day.exits}" style="height: ${exitHeight}%"></i><label>${day.label}</label></div>`;
    }).join('');
}

function setupInventoryScrollbar() {
    const tableWrap = document.querySelector('.inventory-table-wrap');
    if (!tableWrap || tableWrap.dataset.scrollbarReady) return;
    tableWrap.dataset.scrollbarReady = 'true';
    const scrollbar = document.createElement('div');
    const scrollbarContent = document.createElement('div');
    scrollbar.className = 'inventory-scrollbar';
    scrollbar.append(scrollbarContent);
    document.body.append(scrollbar);

    const syncSizeAndPosition = () => {
        const table = tableWrap.querySelector('table');
        const bounds = tableWrap.getBoundingClientRect();
        const visible = bounds.bottom > 0 && bounds.top < window.innerHeight;
        const hasOverflow = table && table.scrollWidth > tableWrap.clientWidth;
        scrollbarContent.style.width = `${table ? table.scrollWidth : 0}px`;
        scrollbar.style.left = `${bounds.left}px`;
        scrollbar.style.width = `${bounds.width}px`;
        scrollbar.style.bottom = '0px';
        scrollbar.style.display = visible && hasOverflow ? 'block' : 'none';
        scrollbar.scrollLeft = tableWrap.scrollLeft;
    };

    tableWrap.addEventListener('scroll', () => { scrollbar.scrollLeft = tableWrap.scrollLeft; });
    scrollbar.addEventListener('scroll', () => { tableWrap.scrollLeft = scrollbar.scrollLeft; });
    window.addEventListener('scroll', syncSizeAndPosition, { passive: true });
    window.addEventListener('resize', syncSizeAndPosition);
    syncSizeAndPosition();
}

function notifyLowStock() {
    const notificationToggle = document.querySelector('#low-stock-notifications');
    if (!notificationToggle.checked) return;
    const lowProducts = state.products.filter(product => product.stock <= product.min_stock);
    const signature = lowProducts.map(product => `${product.id}:${product.stock}`).join('|');
    if (!signature) {
        sessionStorage.removeItem('lowStockNotification');
        return;
    }
    if (sessionStorage.getItem('lowStockNotification') === signature) return;
    sessionStorage.setItem('lowStockNotification', signature);
    const productNames = lowProducts
        .slice(0, 5)
        .map(product => `${product.name} (${product.stock}/${product.min_stock})`)
        .join(', ');
    const remainingCount = lowProducts.length - Math.min(lowProducts.length, 5);
    const message = lowProducts.length === 1
        ? `Falta de stock: ${lowProducts[0].name} tiene ${lowProducts[0].stock} de ${lowProducts[0].min_stock} unidades.`
        : `Falta de stock: ${lowProducts.length} productos: ${productNames}${remainingCount ? ` y ${remainingCount} más` : ''}.`;
    showToast(message, false, true);
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Falta de stock', { body: message });
    }
}

async function loadData() {
    const sessionInfo = await api('/api/session');
    state.role = sessionInfo.role;
    state.adminConfigured = sessionInfo.admin_configured;
    state.canViewDashboard = sessionInfo.can_view_dashboard !== false;
    updateRoleInterface();
    const [dashboard, products, inventoryProducts, movements] = await Promise.all([
        state.canViewDashboard ? api('/api/dashboard') : Promise.resolve(null),
        api('/api/products'), api('/api/products?all=1'), api('/api/movements'),
    ]);
    state.products = products;
    state.inventoryProducts = inventoryProducts;
    state.movements = movements;
    if (dashboard) {
        document.querySelector('#metric-products').textContent = dashboard.products;
        document.querySelector('#metric-units').textContent = dashboard.units.toLocaleString('es-MX');
    }
    document.querySelector('#metric-low').textContent = state.products.filter(product => product.stock <= product.min_stock).length;
    if (dashboard) {
        const inventoryValue = Number(dashboard.inventory_value || 0);
        document.querySelector('#metric-value').textContent = inventoryValue > 0 ? money(inventoryValue) : 'N/D';
        document.querySelector('#metric-value-note').textContent = inventoryValue > 0 ? 'Valor total disponible' : 'El Excel no incluye precios';
    }
    renderProducts();
    renderMovements();
    renderActivityChart();
    renderReports();
    setupInventoryScrollbar();
    notifyLowStock();
}

document.querySelector('#activity-period')?.addEventListener('change', renderActivityChart);

// Mantiene actualizado el dashboard si el inventario cambia desde otra sesión.
let dashboardRefreshInProgress = false;
async function refreshDashboardInventory() {
    if (dashboardRefreshInProgress || document.visibilityState === 'hidden') return;
    dashboardRefreshInProgress = true;
    try {
        await loadData();
    } catch (error) {
        // La próxima revisión volverá a intentar actualizar los datos.
    } finally {
        dashboardRefreshInProgress = false;
    }
}

window.setInterval(refreshDashboardInventory, 60000);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshDashboardInventory();
});

function navigate(viewName) {
    if (viewName === 'dashboard' && !state.canViewDashboard) viewName = 'inventory';
    document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === viewName));
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === `view-${viewName}`));
    const nav = document.querySelector(`[data-view="${viewName}"]`);
    document.querySelector('#page-name').textContent = nav ? nav.lastElementChild.textContent : 'Dashboard';
    document.querySelector('#sidebar').classList.remove('open');
}

function findMovementProduct(query) {
    const value = String(query || '').trim();
    if (!value) return null;
    const products = state.inventoryProducts;
    const byId = products.find(product => String(product.id) === value)
        || state.products.find(product => String(product.id) === value);
    if (byId) return byId;

    const normalizedValue = value.toLocaleLowerCase('es');
    const bySuggestion = products.find(product => movementProductSuggestion(product).toLocaleLowerCase('es') === normalizedValue);
    if (bySuggestion) return bySuggestion;

    const exactMatches = products.filter(product => String(product.name || product.description || '').trim().toLocaleLowerCase('es') === normalizedValue);
    const uniqueExactMatches = [...new Map(exactMatches.map(product => [getSearchProductIdentity(product), product])).values()];
    if (uniqueExactMatches.length === 1) return uniqueExactMatches[0];

    const partialMatches = products.filter(product => String(product.name || product.description || '').trim().toLocaleLowerCase('es').includes(normalizedValue));
    const uniquePartialMatches = [...new Map(partialMatches.map(product => [getSearchProductIdentity(product), product])).values()];
    return uniquePartialMatches.length === 1 ? uniquePartialMatches[0] : null;
}

function movementProductSuggestion(product) {
    const group = getSearchGroupLabel(product) || product.group || product.source_sheet || 'Sin grupo';
    return `${product.name || product.description || 'Producto sin nombre'} — ${group} · ${Number(product.stock || 0)} uds.`;
}

function hideMovementProductSuggestions() {
    movementProductSuggestions.hidden = true;
    movementProductInput.setAttribute('aria-expanded', 'false');
    movementProductInput.removeAttribute('aria-activedescendant');
    activeMovementSuggestionIndex = -1;
}

function updateMovementProductSuggestions(query) {
    const searchTerms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
    if (!searchTerms.length) {
        movementProductSuggestions.replaceChildren();
        hideMovementProductSuggestions();
        return;
    }
    const matches = state.inventoryProducts.filter(product => {
        const searchableText = normalizeSearchText([
            product.name, product.description, product.model, product.part_number, product.sku,
            product.brand, product.group, product.source_sheet, product.observation,
        ].join(' '));
        return searchTerms.every(term => searchableText.includes(term));
    }).slice(0, 8);
    movementProductSuggestions.innerHTML = matches.length
        ? matches.map((product, index) => `<div class="movement-product-option" id="movement-product-option-${index}" role="option" aria-selected="false" data-product-id="${escapeHtml(product.id)}">${escapeHtml(movementProductSuggestion(product))}</div>`).join('')
        : '<div class="movement-product-empty">No hay coincidencias en el inventario.</div>';
    movementProductSuggestions.hidden = false;
    movementProductInput.setAttribute('aria-expanded', 'true');
    activeMovementSuggestionIndex = -1;
}

function selectMovementProduct(productId) {
    const product = state.inventoryProducts.find(item => String(item.id) === String(productId));
    if (!product) return;
    selectedMovementProductId = product.id;
    movementProductInput.value = movementProductSuggestion(product);
    populateMovementProductFields();
    hideMovementProductSuggestions();
}

function setActiveMovementSuggestion(index) {
    const options = [...movementProductSuggestions.querySelectorAll('[role="option"]')];
    if (!options.length) return;
    activeMovementSuggestionIndex = (index + options.length) % options.length;
    options.forEach((option, optionIndex) => {
        option.setAttribute('aria-selected', String(optionIndex === activeMovementSuggestionIndex));
    });
    const activeOption = options[activeMovementSuggestionIndex];
    movementProductInput.setAttribute('aria-activedescendant', activeOption.id);
    activeOption.scrollIntoView({ block: 'nearest' });
}

function populateMovementProductFields() {
    const product = state.inventoryProducts.find(item => String(item.id) === String(selectedMovementProductId))
        || findMovementProduct(movementProductInput.value);
    if (!product) {
        document.querySelector('#movement-form [name="part_number"]').value = '';
        document.querySelector('#movement-form [name="model"]').value = '';
        document.querySelector('#movement-form [name="project"]').value = '';
        const brandSelect = document.querySelector('#movement-brand');
        if (brandSelect) brandSelect.value = '';
        return;
    }
    document.querySelector('#movement-form [name="part_number"]').value = product.part_number || '';
    document.querySelector('#movement-form [name="model"]').value = product.model || '';
    document.querySelector('#movement-form [name="project"]').value = product.project || '';
    const brandSelect = document.querySelector('#movement-brand');
    if (brandSelect) {
        const brand = String(product.brand || '').trim();
        if (brand && ![...brandSelect.options].some(option => option.value === brand)) brandSelect.add(new Option(brand, brand));
        brandSelect.value = brand;
    }
    const floorSelect = document.querySelector('#movement-floor');
    if (floorSelect) floorSelect.value = ['Piso 1', 'Piso 5'].includes(product.floor) ? product.floor : 'Piso 1';
    document.querySelector('#movement-locker').value = product.location || '';
    document.querySelector('#movement-position').value = product.position || '';
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
        editingMovementId = null;
        selectedMovementProductId = null;
        document.querySelector('#movement-form-wrap h2').textContent = 'Registro de Movimientos';
        document.querySelector('#movement-form button[type="submit"]').textContent = 'Guardar Movimiento';
        document.querySelector('#movement-form').reset();
        hideMovementProductSuggestions();
        const brands = [...new Set(state.products.map(product => String(product.brand || '').trim()).filter(Boolean))].sort((first, second) => first.localeCompare(second, 'es'));
        let brandField = document.querySelector('#movement-brand');
        if (!brandField) {
            const movementDetails = document.createElement('div');
            movementDetails.className = 'movement-details-fields';
            movementDetails.innerHTML = '<div class="form-grid movement-fields"><label>Marca<select name="brand" id="movement-brand"><option value="">Selecciona una marca</option></select></label><label>GRUPO<select name="group" id="movement-group" required><option value="">Selecciona un grupo</option><option value="VENTA">VENTA</option><option value="ACTIVO">ACTIVO</option><option value="PROYECTO">PROYECTO</option><option value="SERVICIO">SERVICIO</option></select></label></div><div class="form-grid movement-fields movement-location-fields"><label>Ubicación<select name="floor" id="movement-floor" required><option value="Piso 1">Piso 1</option><option value="Piso 5">Piso 5</option></select></label><label>Locker<input name="location" id="movement-locker" placeholder="Escribe el locker"></label><label>Posición<input name="position" id="movement-position" placeholder="Escribe la posición"></label></div>';
            const noteField = document.querySelector('#movement-form textarea[name="note"]').parentElement;
            noteField.before(movementDetails);
            brandField = movementDetails.querySelector('#movement-brand');
        }
        brandField.innerHTML = '<option value="">Selecciona una marca</option>' + brands.map(brand => `<option value="${escapeHtml(brand)}">${escapeHtml(brand)}</option>`).join('');
        document.querySelector('#movement-group').value = '';
        document.querySelector('#movement-floor').value = 'Piso 1';
        document.querySelector('#movement-date').value = new Date().toISOString().slice(0, 10);
        populateMovementProductFields();
    }
}
function closeModal() { document.querySelector('#modal-backdrop').classList.remove('open'); document.querySelector('#product-modal-modern').classList.remove('open'); }

function filterProducts(query) {
    const term = query.toLowerCase();
    document.querySelectorAll('#products-table tr').forEach(row => { row.hidden = !row.textContent.toLowerCase().includes(term); });
}
function getSearchProductIdentity(product) {
    const attributes = [product.name || product.description, product.brand, product.model, product.part_number]
        .map(value => normalizeSearchText(value));
    const identity = attributes.join('|');
    return identity.replace(/\|/g, '') ? `product:${identity}` : `sku:${String(product.sku || product.id)}`;
}

function getSearchGroupLabel(product) {
    const group = String(product.group || product.category || product.source_sheet || 'Sin grupo').trim();
    const normalized = group.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    if (['venta', 'ventas'].includes(normalized)) return 'Ventas';
    if (['activo', 'activos'].includes(normalized)) return 'Activo';
    if (['proyecto', 'proyectos'].includes(normalized)) return 'Proyecto';
    return null;
}

function normalizeSearchText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('es')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function getSearchStocksByIdentity() {
    const stocksByIdentity = new Map();
    state.inventoryProducts.forEach(item => {
        const identity = getSearchProductIdentity(item);
        if (!stocksByIdentity.has(identity)) stocksByIdentity.set(identity, { Ventas: 0, Activo: 0, Proyecto: 0 });
        const group = getSearchGroupLabel(item);
        if (group) stocksByIdentity.get(identity)[group] += Number(item.stock || 0);
    });
    return stocksByIdentity;
}

function renderSearch(query) {
    const term = normalizeSearchText(query);
    const searchTerms = term.split(/\s+/).filter(Boolean);
    const matchingProducts = state.inventoryProducts.filter(product => {
        const searchableText = normalizeSearchText([
            product.name, product.description, product.model, product.part_number, product.sku,
            product.item, product.category, product.brand, product.group, product.source_sheet,
            product.location, product.floor, product.position, product.section, product.observation,
        ].join(' '));
        return searchTerms.every(searchTerm => searchableText.includes(searchTerm));
    });
    const results = [...new Map(matchingProducts.map(product => [
        getSearchProductIdentity(product),
        product,
    ])).values()];
    const stocksByIdentity = getSearchStocksByIdentity();
    document.querySelector('#search-results').innerHTML = term ? results.map(product => {
        const groupTotals = stocksByIdentity.get(getSearchProductIdentity(product)) || { Ventas: 0, Activo: 0, Proyecto: 0 };
        const totalStock = groupTotals.Ventas + groupTotals.Activo + groupTotals.Proyecto;
        const groupSummary = Object.entries(groupTotals)
            .map(([group, quantity]) => `<div class="search-stock-group"><span>${escapeHtml(group)}</span><strong>${quantity.toLocaleString('es-MX')} uds.</strong></div>`)
            .join('');
        return `<article class="search-result"><button class="search-result-main" type="button" data-product-detail="${escapeHtml(product.id)}"><span class="product-dot">${escapeHtml((product.name || '?').charAt(0))}</span><div><strong data-copy-name="${escapeHtml(product.name || 'Producto sin nombre')}" title="Clic para copiar">${escapeHtml(product.name || 'Producto sin nombre')}</strong><small>Marca: ${escapeHtml(product.brand || '-')} · Modelo: ${escapeHtml(product.model || '-')}</small></div><b>${totalStock.toLocaleString('es-MX')} uds.</b></button><section class="search-stock-panel" aria-label="Existencias por grupo"><div class="search-stock-heading">Existencias por grupo</div><div class="search-stock-breakdown">${groupSummary}</div></section></article>`;
    }).join('') || '<div class="empty-state">No encontramos resultados.</div>' : '<div class="empty-state">Empieza a escribir para buscar productos.</div>';
}

async function refreshSearchInventory(query) {
    const requestId = ++searchInventoryRequestId;
    try {
        const inventoryProducts = await api('/api/products?all=1');
        if (requestId !== searchInventoryRequestId || query !== document.querySelector('#global-search').value) return;
        state.inventoryProducts = inventoryProducts;
        renderSearch(query);
    } catch (error) {
        if (requestId === searchInventoryRequestId) showToast(error.message, true);
    }
}

function scheduleSearchInventoryRefresh(query) {
    window.clearTimeout(searchInventoryRefreshTimer);
    searchInventoryRefreshTimer = window.setTimeout(() => refreshSearchInventory(query), 200);
}

function openProductDetails(productId) {
    const product = state.inventoryProducts.find(item => String(item.id) === String(productId))
        || state.products.find(item => String(item.id) === String(productId));
    if (!product) return;
    const identity = getSearchProductIdentity(product);
    const relatedProducts = state.inventoryProducts.filter(item => getSearchProductIdentity(item) === identity);
    const groupStocks = getSearchStocksByIdentity().get(identity) || { Ventas: 0, Activo: 0, Proyecto: 0 };
    const currentStock = groupStocks.Ventas + groupStocks.Activo + groupStocks.Proyecto;
    const projectStocks = relatedProducts.reduce((projects, item) => {
        if (getSearchGroupLabel(item) !== 'Proyecto') return projects;
        const project = String(item.project || '').trim() || 'Proyecto';
        projects.set(project, (projects.get(project) || 0) + Number(item.stock || 0));
        return projects;
    }, new Map());

    let backdrop = document.querySelector('#product-detail-backdrop');
    if (!backdrop) {
        document.body.insertAdjacentHTML('beforeend', '<div class="modal-backdrop" id="product-detail-backdrop"><section class="modal product-detail-modal" role="dialog" aria-modal="true" aria-labelledby="product-detail-title"><button class="modal-close" type="button" aria-label="Cerrar detalles">×</button><p class="eyebrow">Detalle del producto</p><h2 id="product-detail-title"></h2><div class="product-detail-grid"></div></section></div>');
        backdrop = document.querySelector('#product-detail-backdrop');
        backdrop.addEventListener('click', event => {
            if (event.target === backdrop || event.target.closest('.modal-close')) backdrop.classList.remove('open');
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') backdrop.classList.remove('open');
        });
    }

    const detailValue = value => value === null || value === undefined || String(value).trim() === '' ? '-' : String(value);
    const getOptionalStock = fields => {
        const hasField = relatedProducts.some(item => fields.some(field =>
            item[field] !== undefined && item[field] !== null && item[field] !== ''
        ));
        if (!hasField) return null;
        return relatedProducts.reduce((total, item) => {
            const field = fields.find(name => item[name] !== undefined && item[name] !== null && item[name] !== '');
            return total + Number(field ? item[field] || 0 : 0);
        }, 0);
    };
    const reservedStock = getOptionalStock(['reserved_stock', 'stock_reserved', 'reserved']);
    const transitStock = getOptionalStock(['in_transit', 'stock_in_transit', 'transit_stock']);
    const availableStock = getOptionalStock(['available_stock', 'stock_available', 'available'])
        ?? Math.max(0, currentStock - (reservedStock || 0));
    const locationParts = [...new Set(relatedProducts
        .map(item => [item.location, item.floor, item.position, item.section].filter(Boolean).join(' · '))
        .filter(Boolean))];
    const description = product.description || product.name;
    const details = [
        ['Marca', product.brand],
        ['Modelo', product.model],
        ...(description && description !== product.name ? [['Descripción', description]] : []),
        ['Grupo', product.category],
        ['Stock actual', currentStock],
        ['Stock disponible', availableStock],
        ...(reservedStock === null ? [] : [['Stock reservado', reservedStock]]),
        ...(transitStock === null ? [] : [['En tránsito', transitStock]]),
        ['Proyecto', [...projectStocks.keys()].join(', ') || product.project],
        ...([...projectStocks].map(([project, quantity]) => [`Cantidad en ${project}`, quantity])),
        ['Ubicación actual', locationParts.join(' / ') || product.location],
        ['Estado actual', product.status || product.state || (availableStock > 0 ? 'Disponible' : 'Sin existencias')],
    ];
    backdrop.querySelector('#product-detail-title').textContent = product.name || 'Producto sin nombre';
    backdrop.querySelector('.product-detail-grid').innerHTML = details.map(([label, value]) => `<div class="product-detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(detailValue(value))}</strong></div>`).join('');
    backdrop.classList.add('open');
}

document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => {
    navigate(item.dataset.view);
    if (item.dataset.view === 'search') refreshSearchInventory(document.querySelector('#global-search').value);
}));
document.querySelectorAll('[data-view-link]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.viewLink)));
document.querySelectorAll('[data-open-modal]').forEach(button => button.addEventListener('click', () => openModal(button.dataset.openModal)));
document.querySelector('#role-toggle').addEventListener('click', async () => {
    if (state.role === 'public') {
        window.location.href = '/login';
        return;
    }
    try {
        await api('/api/logout', { method: 'POST' });
        window.location.href = '/login';
        return;
        showToast('Sesión de administrador cerrada.');
    } catch (error) { showToast(error.message, true); }
});
document.querySelector('#modal-close').addEventListener('click', closeModal);
document.querySelector('#product-modal-close').addEventListener('click', closeModal);
document.querySelector('#modal-backdrop').addEventListener('click', event => { if (event.target.id === 'modal-backdrop') closeModal(); });
document.querySelector('#product-modal-modern').addEventListener('click', event => { if (event.target.id === 'product-modal-modern') closeModal(); });
document.querySelector('#mobile-menu').addEventListener('click', () => document.querySelector('#sidebar').classList.toggle('open'));
document.querySelector('#product-filter').addEventListener('input', event => filterProducts(event.target.value));
document.querySelector('#global-search').addEventListener('input', event => scheduleSearchInventoryRefresh(event.target.value));
document.querySelector('#clear-global-search').addEventListener('click', () => {
    const searchInput = document.querySelector('#global-search');
    searchInput.value = '';
    window.clearTimeout(searchInventoryRefreshTimer);
    searchInventoryRequestId += 1;
    renderSearch('');
    searchInput.focus();
});
document.querySelector('#search-results').addEventListener('click', async event => {
    const copyName = event.target.closest('[data-copy-name]');
    if (copyName) {
        event.preventDefault();
        const name = copyName.dataset.copyName;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(name);
            } else {
                const temporaryInput = document.createElement('textarea');
                temporaryInput.value = name;
                temporaryInput.style.position = 'fixed';
                temporaryInput.style.opacity = '0';
                document.body.append(temporaryInput);
                temporaryInput.select();
                const copied = document.execCommand('copy');
                temporaryInput.remove();
                if (!copied) throw new Error('No se pudo copiar el nombre.');
            }
            showToast('Nombre copiado al portapapeles.');
        } catch (error) { showToast(error.message, true); }
        return;
    }
    const result = event.target.closest('[data-product-detail]');
    if (result) openProductDetails(result.dataset.productDetail);
});
document.querySelector('#movements-table').addEventListener('click', async event => {
    const editButton = event.target.closest('[data-edit-movement]');
    if (editButton) {
        const movement = state.movements.find(item => String(item.id) === editButton.dataset.editMovement);
        if (!movement) return;
        openModal('movement');
        editingMovementId = movement.id;
        document.querySelector('#movement-form-wrap h2').textContent = 'Editar movimiento';
        document.querySelector('#movement-form button[type="submit"]').textContent = 'Guardar cambios';
        const product = [...state.products, ...state.inventoryProducts].find(item => String(item.id) === String(movement.product_id));
        if (product) {
            selectedMovementProductId = product.id;
            movementProductInput.value = movementProductSuggestion(product);
        }
        document.querySelector('#movement-form [name="movement_type"]').value = movement.movement_type;
        document.querySelector('#movement-form [name="quantity"]').value = movement.quantity;
        document.querySelector('#movement-date').value = String(movement.created_at || '').slice(0, 10);
        document.querySelector('#movement-form [name="note"]').value = movement.note || '';
        populateMovementProductFields();
        document.querySelector('#movement-form [name="project"]').value = movement.project || '';
        document.querySelector('#movement-group').value = movement.group || '';
        document.querySelector('#movement-floor').value = ['Piso 1', 'Piso 5'].includes(movement.location) ? movement.location : (['Piso 1', 'Piso 5'].includes(movement.floor) ? movement.floor : (['Piso 1', 'Piso 5'].includes(product?.floor) ? product.floor : 'Piso 1'));
        document.querySelector('#movement-locker').value = movement.location === 'Piso 1' || movement.location === 'Piso 5' ? (product?.location || '') : (movement.location || product?.location || '');
        document.querySelector('#movement-position').value = movement.position || product?.position || '';
        return;
    }
    const button = event.target.closest('[data-delete-movement]');
    if (!button || !window.confirm('¿Eliminar este movimiento y revertir su efecto en el stock?')) return;
    try {
        await api(`/api/movements/${button.dataset.deleteMovement}`, { method: 'DELETE' });
        state.movements = state.movements.filter(move => String(move.id) !== String(button.dataset.deleteMovement));
        renderMovements();
        showToast('Movimiento eliminado correctamente.');
        await loadData();
    } catch (error) { showToast(error.message, true); }
});
document.querySelector('#products-table').addEventListener('click', async event => {
    const button = event.target.closest('[data-delete-product]');
    if (!button || !window.confirm('¿Eliminar este producto y sus copias repetidas?')) return;
    try {
        await api(`/api/products/${button.dataset.deleteProduct}`, { method: 'DELETE' });
        showToast('Producto eliminado correctamente.');
        await loadData();
    } catch (error) { showToast(error.message, true); }
});
document.querySelector('#inventory-table').addEventListener('click', event => {
    const button = event.target.closest('[data-inline-edit]');
    if (button) startInlineInventoryEdit(button);
});
document.querySelector('#edit-profile-button').addEventListener('click', editProfileName);
document.querySelector('#low-stock-notifications').addEventListener('change', async event => {
    if (!event.target.checked) return;
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
    notifyLowStock();
});
updateRoleInterface();
renderProfileName();

document.querySelector('#product-form-modern').addEventListener('submit', async event => {
    event.preventDefault();
    try { const data = Object.fromEntries(new FormData(event.target)); data.sku = `AUTO-${Date.now()}`; await api('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); event.target.reset(); closeModal(); showToast('Producto guardado correctamente.'); await loadData(); navigate('products'); } catch (error) { showToast(error.message, true); }
});
document.querySelector('#movement-form').addEventListener('input', event => {
    if (event.target.id === 'movement-sku') {
        selectedMovementProductId = null;
        updateMovementProductSuggestions(event.target.value);
        populateMovementProductFields();
    }
});
movementProductSuggestions.addEventListener('mousedown', event => {
    if (event.target.closest('[data-product-id]')) event.preventDefault();
});
movementProductSuggestions.addEventListener('click', event => {
    const option = event.target.closest('[data-product-id]');
    if (option) selectMovementProduct(option.dataset.productId);
});
movementProductInput.addEventListener('keydown', event => {
    if (movementProductSuggestions.hidden) return;
    if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveMovementSuggestion(activeMovementSuggestionIndex + 1);
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveMovementSuggestion(activeMovementSuggestionIndex - 1);
    } else if (event.key === 'Enter' && activeMovementSuggestionIndex >= 0) {
        event.preventDefault();
        const option = movementProductSuggestions.querySelectorAll('[data-product-id]')[activeMovementSuggestionIndex];
        if (option) selectMovementProduct(option.dataset.productId);
    } else if (event.key === 'Escape') {
        hideMovementProductSuggestions();
    }
});
movementProductInput.addEventListener('blur', () => {
    window.setTimeout(hideMovementProductSuggestions, 150);
});
document.querySelector('#movement-form').addEventListener('reset', () => {
    selectedMovementProductId = null;
    hideMovementProductSuggestions();
});
document.querySelector('#movement-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
        const data = Object.fromEntries(new FormData(event.target));
        const product = state.inventoryProducts.find(item => String(item.id) === String(selectedMovementProductId))
            || findMovementProduct(data.product_query);
        if (!product) throw new Error('No se encontró un producto único. Escribe más del nombre o elige una sugerencia con el grupo correcto.');
        data.product_id = Number(product.id);
        delete data.product_query;
        data.quantity = Number(data.quantity);
        const editing = editingMovementId !== null;
        const url = editing ? `/api/movements/${editingMovementId}` : '/api/movements';
        await api(url, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        event.target.reset();
        editingMovementId = null;
        closeModal();
        showToast(editing ? 'Movimiento actualizado correctamente.' : 'Movimiento registrado correctamente.');
        await loadData();
        navigate('movements');
    } catch (error) { showToast(error.message, true); }
});
document.querySelector('#import-button').addEventListener('click', () => document.querySelector('#inventory-upload').click());
document.querySelector('#inventory-upload').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
        const response = await fetch('/api/import', { method: 'POST', body: formData });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo importar el Excel.');
        await loadData();
        showToast(`Excel importado: ${result.count} filas de inventario.`);
    } catch (error) { showToast(error.message, true); }
    finally { event.target.value = ''; }
});
document.querySelector('#export-button').addEventListener('click', async () => { try { const response = await fetch('/api/export'); if (!response.ok) throw new Error('No se pudo exportar el inventario.'); const blob = await response.blob(); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `inventario-nakama-soluciones-${new Date().toISOString().slice(0, 10)}.xlsx`; link.click(); URL.revokeObjectURL(link.href); showToast('Excel exportado correctamente.'); } catch (error) { showToast(error.message, true); } });
document.querySelector('#report-button').addEventListener('click', async () => {
    try {
        const params = new URLSearchParams();
        const month = document.querySelector('#report-month').value;
        const year = document.querySelector('#report-year').value;
        if (month) params.set('month', month);
        if (year) params.set('year', year);
        const response = await fetch(`/api/export-movements?${params}`);
        if (!response.ok) throw new Error('No se pudieron exportar los movimientos.');
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `entradas-y-salidas-de-stock-${new Date().toISOString().slice(0, 10)}.xlsx`;
        link.click();
        URL.revokeObjectURL(link.href);
        showToast('Movimientos exportados correctamente.');
    } catch (error) { showToast(error.message, true); }
});
document.querySelector('#report-pdf-button').addEventListener('click', async () => {
    try {
        const params = new URLSearchParams();
        const month = document.querySelector('#report-month').value;
        const year = document.querySelector('#report-year').value;
        if (month) params.set('month', month);
        if (year) params.set('year', year);
        const response = await fetch(`/api/export-movements-pdf?${params}`);
        if (!response.ok) throw new Error('No se pudo descargar el reporte PDF.');
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `reporte-movimientos-${new Date().toISOString().slice(0, 10)}.pdf`;
        link.click();
        URL.revokeObjectURL(link.href);
        showToast('Reporte PDF descargado correctamente.');
    } catch (error) { showToast(error.message, true); }
});
loadData().catch(error => showToast(error.message, true));

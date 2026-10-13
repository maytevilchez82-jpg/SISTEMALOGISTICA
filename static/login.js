const form = document.querySelector('#login-form');
const passwordInput = document.querySelector('#password');
const usernameInput = document.querySelector('#username');
const message = document.querySelector('#form-message');
const submitButton = document.querySelector('#login-submit');
const formatCount = value => Number(value || 0).toLocaleString('es-PE');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

async function loadLoginOverview() {
    try {
        const [dashboardResponse, productsResponse, movementsResponse] = await Promise.all([
            fetch('/api/dashboard'), fetch('/api/products?all=1'), fetch('/api/movements'),
        ]);
        if (![dashboardResponse, productsResponse, movementsResponse].every(response => response.ok)) return;
        const [dashboard, products, movements] = await Promise.all([
            dashboardResponse.json(), productsResponse.json(), movementsResponse.json(),
        ]);
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const dispatchesToday = movements.filter(move => move.movement_type === 'Salida' && String(move.created_at || '').startsWith(today)).length;
        const locations = new Set(products.map(product => String(product.location || '').trim()).filter(Boolean)).size;
        const setText = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
        setText('login-stock', formatCount(dashboard.units));
        setText('login-dispatches', formatCount(dispatchesToday));
        setText('login-locations', formatCount(locations));
        setText('login-movements', formatCount(movements.length));
        setText('login-live-stock', `${formatCount(dashboard.units)} unidades`);
        setText('login-live-dispatches', `${formatCount(dispatchesToday)} en proceso`);
        setText('login-live-locations', `${formatCount(locations)} ubicaciones`);
        setText('login-live-status', dashboard.low_stock ? `${formatCount(dashboard.low_stock)} con stock bajo` : 'Sin incidencias');
        const recent = movements.slice(0, 4);
        const activity = document.querySelector('#login-recent-movements');
        if (activity) activity.innerHTML = recent.length ? recent.map(move => {
            const isEntry = move.movement_type === 'Entrada';
            const name = escapeHtml(move.product_name || 'Producto');
            const rawDate = String(move.created_at || '').slice(0, 10);
            const parsedDate = rawDate ? new Date(`${rawDate}T12:00:00`) : null;
            const labelDate = parsedDate && !Number.isNaN(parsedDate.valueOf()) ? parsedDate.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) : '—';
            return `<div class="preview-row"><i>${isEntry ? '↓' : '↑'}</i><span>${name}<small>${isEntry ? 'Ingreso' : 'Despacho'} · ${formatCount(move.quantity)} uds.</small></span><b>${escapeHtml(labelDate)}</b></div>`;
        }).join('') : '<div class="preview-empty">Sin movimientos registrados</div>';
    } catch (_) {
        // La pantalla de acceso sigue disponible si el resumen no carga.
    }
}

document.querySelector('#password-toggle').addEventListener('click', event => {
    const reveal = passwordInput.type === 'password';
    passwordInput.type = reveal ? 'text' : 'password';
    event.currentTarget.textContent = reveal ? 'Ocultar' : 'Mostrar';
    event.currentTarget.setAttribute('aria-label', reveal ? 'Ocultar contraseña' : 'Mostrar contraseña');
    passwordInput.focus();
});

form.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = '';
    message.classList.remove('visible');
    submitButton.disabled = true;
    submitButton.classList.add('loading');
    submitButton.querySelector('span').textContent = 'Verificando acceso…';
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput.value, password: passwordInput.value }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo iniciar sesión.');
        window.location.assign('/inventario');
    } catch (error) {
        message.textContent = error.message;
        message.classList.add('visible');
        passwordInput.select();
        submitButton.disabled = false;
        submitButton.classList.remove('loading');
        submitButton.querySelector('span').textContent = 'Iniciar sesión';
    }
});

fetch('/api/session').then(response => response.json()).then(sessionInfo => {
    if (sessionInfo.role === 'admin' || sessionInfo.role === 'visitor') window.location.replace('/inventario');
    if (!sessionInfo.admin_configured && !sessionInfo.visitor_configured) {
        message.textContent = 'El acceso aún no está configurado en el servidor.';
        message.classList.add('visible', 'setup-message');
        submitButton.disabled = true;
    }
}).catch(() => {});

loadLoginOverview();

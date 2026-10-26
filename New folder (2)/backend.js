(function () {
  'use strict';

  let orders = [];
  let currentUser = null;
  const orderChannel = 'BroadcastChannel' in window ? new BroadcastChannel('northstar-orders') : null;

  function notifyOtherTabs() {
    if (orderChannel) orderChannel.postMessage('orders-updated');
  }

  async function request(path, options = {}) {
    const { headers, ...requestOptions } = options;
    const response = await fetch(path, {
      ...requestOptions,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...headers }
    });
    if (!response.headers.get('Content-Type')?.includes('application/json')) {
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      throw new Error('The server returned an invalid response.');
    }
    const body = await response.json();
    if (!response.ok) {
      const error = new Error(body.error || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  async function loadOrders() {
    const result = await request('/api/orders');
    orders = result.orders;
    window.dispatchEvent(new Event('davipel-orders-updated'));
    return orders;
  }

  window.DavipelBackend = {
    get orders() {
      return orders;
    },
    get currentUser() {
      return currentUser;
    },
    async session() {
      const result = await request('/api/auth/me');
      currentUser = result.user;
      return currentUser;
    },
    async register(account) {
      const result = await request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(account)
      });
      currentUser = result.user;
      orders = result.orders;
      return currentUser;
    },
    async login(email, password) {
      const result = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      currentUser = result.user;
      orders = result.orders;
      return currentUser;
    },
    async logout() {
      await request('/api/auth/logout', { method: 'POST', body: '{}' });
      currentUser = null;
      orders = [];
    },
    async createOrder(shopId, items) {
      const result = await request('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ shopId, items })
      });
      orders.unshift(result.order);
      if (result.user) currentUser = result.user;
      notifyOtherTabs();
      return result.order;
    },
    async updateOrderStatus(orderId, status) {
      const result = await request(`/api/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      const index = orders.findIndex((order) => order.id === result.order.id);
      if (index !== -1) orders[index] = result.order;
      notifyOtherTabs();
      return result.order;
    },
    async refreshOrders() {
      return loadOrders();
    },
    async listAccounts() {
      const result = await request('/api/accounts');
      return result.accounts;
    },
    async createAccount(account) {
      const result = await request('/api/accounts', {
        method: 'POST',
        body: JSON.stringify(account)
      });
      return result.account;
    },
    async removeAccount(accountId) {
      return request(`/api/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' });
    },
    async listShops(includeInactive = false) {
      const suffix = includeInactive ? '?includeInactive=true' : '';
      const result = await request(`/api/shops${suffix}`);
      return result.shops;
    },
    async createShop(shop) {
      const result = await request('/api/shops', {
        method: 'POST',
        body: JSON.stringify(shop)
      });
      return result.shop;
    },
    async removeShop(shopId) {
      return request(`/api/shops/${encodeURIComponent(shopId)}`, { method: 'DELETE' });
    },
    async restoreShop(shopId) {
      const result = await request(`/api/shops/${encodeURIComponent(shopId)}/restore`, { method: 'POST', body: '{}' });
      return result.shop;
    }
  };

  if (orderChannel) {
    orderChannel.addEventListener('message', () => {
      if (currentUser) loadOrders().catch((error) => console.error('Could not refresh orders.', error));
    });
  }
})();

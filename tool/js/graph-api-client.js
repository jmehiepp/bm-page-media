window.FbTool = window.FbTool || {};

(function (ns) {
  // v26.0 is the current Marketing API version. Keep this in sync with the
  // version shown in the settings field; older Marketing API versions expire
  // independently from the general Graph API versions.
  const config = { version: 'v26.0', userToken: '' };

  class GraphError extends Error {
    constructor(error) {
      const detail = error.error_user_msg || error.message || 'Unknown Graph API error';
      const code = error.code ? ` (code ${error.code}${error.error_subcode ? `/${error.error_subcode}` : ''})` : '';
      const isDevelopmentCreative = error.code === 100 && error.error_subcode === 1885183;
      const hint = isDevelopmentCreative
        ? ' Meta App đang ở Development Mode nên Facebook chặn tạo ad creative. Chuyển App sang Live (và hoàn tất quyền ads_management), hoặc dùng Test Ad Account với tài khoản Test đã được thêm vào App.'
        : '';
      super(`${detail}${code}${hint}`);
      this.raw = error;
    }
  }

  function configure({ version, userToken }) {
    if (version) config.version = version.trim();
    if (userToken !== undefined) config.userToken = userToken.trim();
  }

  function serialize(value) {
    return typeof value === 'object' && !(value instanceof Blob) ? JSON.stringify(value) : value;
  }

  async function parseResponse(res) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new GraphError(data.error || { message: res.statusText });
    return data;
  }

  async function request(path, { method = 'GET', params = {}, token, host = 'graph.facebook.com' } = {}) {
    const url = new URL(`https://${host}/${config.version}/${path.replace(/^\//, '')}`);
    const accessToken = token || config.userToken;
    if (!accessToken) throw new Error('Chưa nhập access token');

    if (method === 'GET' || method === 'DELETE') {
      Object.entries(params).forEach(([k, v]) => v !== undefined && url.searchParams.set(k, serialize(v)));
      url.searchParams.set('access_token', accessToken);
      return parseResponse(await fetch(url, { method }));
    }

    const form = new FormData();
    Object.entries(params).forEach(([k, v]) => v !== undefined && form.append(k, serialize(v)));
    form.append('access_token', accessToken);
    return parseResponse(await fetch(url, { method, body: form }));
  }

  async function getAll(path, params = {}, token) {
    let page = await request(path, { params: { limit: 100, ...params }, token });
    const items = [...(page.data || [])];
    while (page.paging && page.paging.next) {
      page = await parseResponse(await fetch(page.paging.next));
      items.push(...(page.data || []));
    }
    return items;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  ns.graph = { configure, request, getAll, sleep, GraphError, config };
})(window.FbTool);

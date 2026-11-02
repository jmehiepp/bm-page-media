window.FbTool = window.FbTool || {};

(function (ns) {
  const { request, getAll } = ns.graph;
  const REQUIRED_PERMISSIONS = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'ads_management'];

  async function requireUserToken() {
    const token = ns.graph.config.userToken;
    if (!token) throw new Error('Dán User Token của tài khoản Facebook cá nhân để kết nối');
    let info;
    try {
      const loginUserId = ns.facebookLogin?.userIdForToken(token);
      if (loginUserId) {
        // FB.login issues a User token. Verify its identity and effective grants
        // without requiring an App Secret or developer-only token introspection.
        const [me, permissions] = await Promise.all([
          request('me', { token, params: { fields: 'id' } }),
          getAll('me/permissions', {}, token),
        ]);
        if (String(me.id) !== loginUserId) throw new Error('Tài khoản trả về không khớp phiên Facebook Login');
        info = { type: 'USER', is_valid: true, scopes: permissions.filter(p => p.status === 'granted').map(p => p.permission) };
      } else {
        const result = await request('debug_token', { params: { input_token: token }, token });
        info = result.data;
      }
    } catch (err) {
      throw new Error(`Không xác minh được loại token: ${err.message}. Cấp lại User Token từ tài khoản Facebook cá nhân rồi kết nối lại.`);
    }
    if (!info || info.is_valid !== true) throw new Error('Token không còn hiệu lực — cấp lại User Token rồi kết nối lại');
    if (info.type !== 'USER') {
      const label = info.type === 'SYSTEM_USER' ? 'System User Token' : info.type === 'PAGE' ? 'Page Token' : (info.type || 'không xác định');
      throw new Error(`Token đang dán là ${label}. Công cụ dùng User Token của tài khoản Facebook cá nhân có quyền trên Page và tài khoản quảng cáo. Cần cấp User Token mới; đổi lựa chọn trên giao diện không chuyển đổi được loại token.`);
    }
    const missing = REQUIRED_PERMISSIONS.filter(permission => !(info.scopes || []).includes(permission));
    if (missing.length) throw new Error(`User Token thiếu quyền: ${missing.join(', ')}. Cấp lại token với các quyền này rồi kết nối lại.`);
    return info;
  }

  const getMe = () => request('me', { params: { fields: 'id,name' } });
  const listPages = () => getAll('me/accounts', { fields: 'id,name,username,access_token,tasks' });

  // A personal User token lists the ad accounts that user can access directly.
  // Do not substitute business-owned or System User assets for that access list.
  const listAdAccounts = () => getAll('me/adaccounts', { fields: 'id,name,account_status,disable_reason,currency' });

  async function getPageToken(pageId) {
    await requireUserToken();
    const page = await request(pageId, { params: { fields: 'access_token' } });
    if (!page.access_token) throw new Error(`Không lấy được Page token cho ${pageId}. Kiểm tra quyền truy cập Page của tài khoản Facebook đã cấp User Token.`);
    return page.access_token;
  }

  async function loadAccountsWithDiagnostics() {
    const tokenAtStart = ns.graph.config.userToken;
    const tokenInfo = await requireUserToken();
    const me = await getMe();
    const [pages, adAccounts] = await Promise.all([listPages(), listAdAccounts()]);
    if (tokenAtStart !== ns.graph.config.userToken) throw new Error('Token thay đổi trong lúc kết nối; vui lòng kết nối lại');
    if (!pages.length) throw new Error('User Token chưa được cấp quyền truy cập Page nào. Kiểm tra các Page đã chọn khi cấp token.');
    return { me, pages, adAccounts, tokenInfo };
  }

  ns.accounts = { requireUserToken, getMe, listPages, listAdAccounts, getPageToken, loadAccountsWithDiagnostics };
})(window.FbTool);

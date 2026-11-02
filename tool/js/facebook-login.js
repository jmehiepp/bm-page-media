window.FbTool = window.FbTool || {};

(function (ns) {
  const config = ns.facebookLoginConfig || {};
  const SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'ads_management'];
  let preparing;
  let ready = false;
  let loginPending = false;
  let session = null;

  function canLogin() {
    return window.location.protocol === 'https:' && /^\d+$/.test(config.appId || '');
  }

  function prepare() {
    if (!canLogin()) return Promise.reject(new Error('Đăng nhập Facebook cần mở bản web HTTPS đã cấu hình App ID.'));
    if (ready) return Promise.resolve();
    if (preparing) return preparing;
    preparing = new Promise((resolve, reject) => {
      let timer;
      let settled = false;
      let script;
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          preparing = null;
          if (script) script.remove();
          reject(error);
        } else {
          ready = true;
          resolve();
        }
      };
      const initialize = () => {
        try {
          if (!window.FB || typeof window.FB.init !== 'function') throw new Error('Facebook SDK chưa sẵn sàng');
          window.FB.init({
            appId: config.appId, version: ns.graph.config.version,
            cookie: false, xfbml: false, status: false, autoLogAppEvents: false,
          });
          finish();
        } catch (error) { finish(error); }
      };
      if (window.FB && typeof window.FB.login === 'function' && !window.FB.__buffer) return initialize();
      window.fbAsyncInit = initialize;
      timer = setTimeout(() => finish(new Error('Không tải được Facebook Login. Kiểm tra mạng hoặc trình chặn nội dung rồi thử lại.')), 20000);
      script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/vi_VN/sdk.js';
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      script.onerror = () => finish(new Error('Không tải được Facebook SDK. Kiểm tra mạng rồi thử lại.'));
      document.head.appendChild(script);
    }).catch(error => {
      preparing = null;
      throw error;
    });
    return preparing;
  }

  // Called directly from a button click after SDK preload so browsers allow its popup.
  function login() {
    if (!ready) return Promise.reject(new Error('Facebook Login chưa sẵn sàng; thử tải lại.'));
    if (loginPending) return Promise.reject(new Error('Cửa sổ đăng nhập Facebook đang mở.'));
    loginPending = true;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (error, response) => {
        if (finished) return;
        finished = true;
        loginPending = false;
        clearTimeout(timer);
        if (error) return reject(error);
        session = { accessToken: response.accessToken, userID: String(response.userID) };
        resolve(session.accessToken);
      };
      const timer = setTimeout(() => finish(new Error('Chưa nhận được kết quả đăng nhập. Kiểm tra cửa sổ Facebook và cấu hình domain của ứng dụng Meta rồi thử lại.')), 120000);
      const options = config.configurationId
        ? { config_id: config.configurationId, response_type: 'token', override_default_response_type: true }
        : { scope: SCOPES.join(','), return_scopes: true, auth_type: 'rerequest' };
      try {
        window.FB.login(response => {
          const auth = response && response.authResponse;
          if (response?.status !== 'connected' || !auth?.accessToken) {
            return finish(new Error('Facebook chưa cấp quyền đăng nhập hoặc cửa sổ đã đóng. Bạn có thể thử lại.'));
          }
          (async () => {
          try {
            // Login for Business can return a token without userID. Resolve it
            // through Meta rather than treating a successful grant as denial.
            const userID = auth.userID || (await ns.graph.request('/me', { params: { fields: 'id' }, token: auth.accessToken })).id;
            if (!userID) throw new Error('Facebook đã trả token nhưng chưa xác minh được danh tính tài khoản.');
            finish(null, { accessToken: auth.accessToken, userID });
          } catch (error) { finish(error); }
          })();
        }, options);
      } catch (error) { finish(error); }
    });
  }

  ns.facebookLogin = {
    canLogin, prepare, login,
    isReady: () => ready,
    hostedUrl: config.hostedUrl,
    userIdForToken: token => session?.accessToken === token ? session.userID : null,
    clearSession: () => { session = null; },
  };
})(window.FbTool);

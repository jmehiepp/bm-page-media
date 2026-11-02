window.FbTool = window.FbTool || {};

// Code 10/200 on publish has several indistinguishable causes, so collect the facts
// that tell them apart instead of making the user guess.
(function (ns) {
  const { request } = ns.graph;

  const debugToken = (token, actor) => request('debug_token', { params: { input_token: token, access_token: actor || token } })
    .then((res) => res.data || {});

  async function report(page, userToken, log) {
    log('🔎 Đang kiểm tra nguyên nhân...');
    try {
      const user = await debugToken(userToken);
      log(`• Token kết nối: app ${user.app_id || '?'}, quyền: ${(user.scopes || []).join(', ') || 'không đọc được'}`);
      if (!(user.scopes || []).includes('pages_manage_posts')) {
        log('• ❌ Token KHÔNG có pages_manage_posts — tạo lại mã truy cập và tích quyền này');
        return;
      }
    } catch (err) {
      log(`• Không đọc được quyền của token: ${err.message}`);
    }

    try {
      const pageToken = await debugToken(page.access_token, userToken);
      log(`• Page token: app ${pageToken.app_id || '?'}, quyền: ${(pageToken.scopes || []).join(', ') || 'không đọc được'}`);
    } catch (err) {
      log(`• Không đọc được Page token: ${err.message}`);
    }

    try {
      const info = await request(page.id, { params: { fields: 'name,is_published' }, token: page.access_token });
      log(`• Page ${info.name}: is_published=${info.is_published}, quyền trên Page: ${(page.tasks || []).join(', ') || 'không đọc được'}`);
      if (info.is_published === false) log('• ❌ Page đang ở chế độ chưa xuất bản — vào Cài đặt Trang bật xuất bản rồi thử lại');
      if (page.tasks && !page.tasks.includes('CREATE_CONTENT')) log('• ❌ Chưa thấy CREATE_CONTENT trên Page — kiểm tra quyền tạo nội dung của tài khoản quản trị');
    } catch (err) {
      log(`• Không đọc được thông tin Page: ${err.message}`);
    }

    // A declared scope alone does not establish effective Page read access.
    try {
      await request(`${page.id}/posts`, { params: { fields: 'id', limit: 1 }, token: page.access_token });
      log('• Đọc được danh sách bài của Page bằng Page token.');
    } catch (err) {
      log(`• Chưa xác nhận được quyền đọc bài trên Page: ${err.message}`);
      log('• Cần xử lý quyền truy cập Page/ứng dụng Meta trước khi có thể xác nhận bài đăng bằng API; danh sách scope của token không đủ để kết luận quyền này hoạt động.');
    }
  }

  ns.publishDiagnostics = { report };
})(window.FbTool);

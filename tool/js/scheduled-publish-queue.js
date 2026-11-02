window.FbTool = window.FbTool || {};

(function (ns) {
  const STORAGE_KEY = 'fbtool.scheduledJobs';

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function save(jobs) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
    } catch {
      /* storage unavailable — queue lives only in memory for this tab */
    }
  }

  let jobs = load();
  let onChange = () => {};

  function add({ runAt, pageId, pageName, storyId }) {
    jobs.push({ id: `${storyId}-${runAt}`, runAt, pageId, pageName, storyId, status: 'pending' });
    save(jobs);
    onChange(jobs);
  }

  function remove(id) {
    jobs = jobs.filter((j) => j.id !== id);
    save(jobs);
    onChange(jobs);
  }

  function update(id, patch) {
    jobs = jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
    save(jobs);
    onChange(jobs);
  }

  // Runs only while this tab is open — there is no server to publish on our behalf.
  function start(log, isConnected = () => true) {
    const tick = async () => {
      if (!isConnected()) return;
      const due = jobs.filter((j) => j.status === 'pending' && j.runAt <= Date.now());
      for (const job of due) {
        if (!isConnected()) break;
        update(job.id, { status: 'running' });
        try {
          const pageToken = await ns.accounts.getPageToken(job.pageId);
          await ns.publisher.publishStory(job.storyId, pageToken);
          update(job.id, { status: 'done' });
          log(`✅ Đã đăng bài hẹn giờ lên ${job.pageName}: ${ns.publisher.postUrl(job.storyId)}`);
        } catch (err) {
          update(job.id, { status: 'error', error: err.message });
          log(`❌ Lỗi đăng bài hẹn giờ ${job.pageName}: ${err.message}`);
        }
      }
    };
    tick();
    setInterval(tick, 30 * 1000);
  }

  ns.queue = {
    list: () => jobs,
    add,
    remove,
    start,
    subscribe: (fn) => {
      onChange = fn;
      fn(jobs);
    },
  };
})(window.FbTool);

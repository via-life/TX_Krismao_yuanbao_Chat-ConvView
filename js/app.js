/* ============================================================
   app.js —— 应用状态机与视图路由
   ============================================================ */
(function () {
  'use strict';

  var state = {
    headers: [],
    rows: [],
    format: 'columns', // 'columns' 分列式(A) | 'messages' 整列式(B)
    mapping: { traceId: null, prompt: null, images: null, history: null, messages: null },
    cases: [],      // 规范化后的 case 列表
    filtered: [],   // 当前过滤结果（索引指向 cases）
    search: ''
  };

  var el = {};
  function $(id) { return document.getElementById(id); }

  function cacheEls() {
    ['view-upload', 'view-overview', 'view-detail', 'view-paste',
     'drop-overlay', 'dropzone', 'pick-btn', 'file-input', 'upload-status', 'paste-entry-btn',
     'mapping-modal', 'mapping-format', 'mapping-fields', 'mapping-close', 'mapping-cancel', 'mapping-confirm',
     'search-input', 'reimport-btn', 'row-count', 'table-body', 'empty-hint',
     'back-btn',
     'paste-textarea', 'paste-chat-list', 'paste-status', 'paste-back-btn', 'paste-clear-btn', 'paste-sample-btn'].forEach(function (id) {
      el[id] = $(id);
    });
  }

  /* ---------- 视图切换 ---------- */
  function showView(name) {
    el['view-upload'].hidden = name !== 'upload';
    el['view-overview'].hidden = name !== 'overview';
    el['view-detail'].hidden = name !== 'detail';
    el['view-paste'].hidden = name !== 'paste';
    window.scrollTo(0, 0);
  }

  function setStatus(msg, isError) {
    el['upload-status'].hidden = !msg;
    el['upload-status'].textContent = msg || '';
    el['upload-status'].classList.toggle('is-error', !!isError);
  }

  /* ---------- 文件处理 ---------- */
  function handleFile(file) {
    if (!file) return;
    setStatus('正在解析「' + file.name + '」…', false);
    Parser.parseFile(file).then(function (result) {
      state.headers = result.headers || [];
      state.rows = result.rows || [];
      if (!state.rows.length) { setStatus('文件解析后没有数据行。', true); return; }

      var map = Parser.autoDetect(state.headers);
      setStatus('已解析 ' + state.rows.length + ' 行。', false);

      // 判定格式：识别到 messages 列 → 整列式(B)；否则分列式(A)
      if (map.messages) {
        state.format = 'messages';
        map.prompt = null; map.images = null; map.history = null;
      } else {
        state.format = 'columns';
        map.messages = null;
      }
      state.mapping = map;

      // 判定所选格式下是否所有必需列都已就位；缺则弹映射
      var complete = state.format === 'messages'
        ? (map.traceId && map.messages)
        : (map.traceId && map.prompt && map.images && map.history);
      if (!complete) {
        openMapping();
      } else {
        buildCasesAndGo();
      }
    }).catch(function (err) {
      console.error(err);
      setStatus('解析失败：' + (err && err.message ? err.message : err), true);
    });
  }

  /* ---------- 手动列映射 ---------- */
  // 两种格式的字段定义
  var FIELD_META_COLUMNS = [
    { key: 'history', label: 'history', required: false, desc: '历史轮次' },
    { key: 'prompt', label: 'prompt', required: true, desc: '当前轮提问' },
    { key: 'images', label: 'images', required: false, desc: '当前轮图片' },
    { key: 'traceId', label: 'trace ID', required: true, desc: '主键标识' }
  ];
  var FIELD_META_MESSAGES = [
    { key: 'traceId', label: 'trace ID', required: true, desc: '主键标识' },
    { key: 'messages', label: '对话内容', required: true, desc: '整列含完整多轮对话（messages 数组）' }
  ];
  function fieldMeta() {
    return state.format === 'messages' ? FIELD_META_MESSAGES : FIELD_META_COLUMNS;
  }

  function openMapping() {
    renderFormatTabs();
    renderMappingFields();
    el['mapping-modal'].hidden = false;
  }

  function renderFormatTabs() {
    var box = el['mapping-format'];
    if (!box) return;
    box.querySelectorAll('.format-tab').forEach(function (t) {
      var fmt = t.getAttribute('data-format');
      t.classList.toggle('is-active', fmt === state.format);
    });
  }

  function renderMappingFields() {
    var html = '';
    fieldMeta().forEach(function (f) {
      var current = state.mapping[f.key];
      html += '<div class="mapping-field">';
      html += '<div class="mapping-field__row">';
      html += '<span class="mapping-field__name">' + f.label + '</span>';
      html += '<span class="mapping-field__req' + (f.required ? ' is-required' : '') + '">' +
              (f.required ? '必选' : '可选') + ' · ' + f.desc + '</span>';
      html += '</div>';
      html += '<select class="field-select" data-field="' + f.key + '">';
      html += '<option value="">— 从数据集选择字段 —</option>';
      state.headers.forEach(function (h) {
        var sel = (h === current) ? ' selected' : '';
        html += '<option value="' + encodeURIComponent(h) + '"' + sel + '>' + escapeHtml(h) + '</option>';
      });
      html += '</select>';
      html += '</div>';
    });
    el['mapping-fields'].innerHTML = html;
  }

  function switchFormat(fmt) {
    if (fmt === state.format) return;
    state.format = fmt;
    renderFormatTabs();
    renderMappingFields();
  }

  function closeMapping() { el['mapping-modal'].hidden = true; }

  function confirmMapping() {
    var selects = el['mapping-fields'].querySelectorAll('.field-select');
    var newMap = { traceId: null, prompt: null, images: null, history: null, messages: null };
    var ok = true;
    selects.forEach(function (s) {
      var field = s.getAttribute('data-field');
      var val = s.value ? decodeURIComponent(s.value) : null;
      newMap[field] = val;
      var meta = fieldMeta().filter(function (m) { return m.key === field; })[0];
      var invalid = meta && meta.required && !val;
      s.classList.toggle('is-invalid', !!invalid);
      if (invalid) ok = false;
    });
    if (!ok) return;
    state.mapping = newMap;
    closeMapping();
    buildCasesAndGo();
  }

  /* ---------- 构建 case 列表（统一为 messages 序列） ---------- */
  function buildCasesAndGo() {
    var m = state.mapping;
    if (state.format === 'messages') {
      state.cases = state.rows.map(function (row) {
        var msgs = m.messages ? Parser.parseMessages(row[m.messages]) : [];
        return { traceId: m.traceId ? (row[m.traceId] || '') : '', messages: msgs };
      });
    } else {
      state.cases = state.rows.map(function (row) {
        var images = m.images ? Parser.parseImages(row[m.images]) : [];
        var history = m.history ? Parser.parseHistory(row[m.history]) : [];
        var prompt = m.prompt ? (row[m.prompt] || '') : '';
        return {
          traceId: m.traceId ? (row[m.traceId] || '') : '',
          messages: Parser.turnsToMessages(history, prompt, images)
        };
      });
    }
    state.search = '';
    if (el['search-input']) el['search-input'].value = '';
    applyFilter();
    showView('overview');
  }

  /* ---------- 总览渲染 ---------- */
  // 从统一消息序列派生总览摘要（缓存到 case 上）
  function summaryOf(c) {
    if (c._summary) return c._summary;
    var msgs = c.messages || [];
    var imgCount = 0, userCount = 0, firstUserText = '', searchText = '';
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      imgCount += (m.images ? m.images.length : 0);
      if (m.role === 'user') {
        userCount++;
        if (!firstUserText && m.text) firstUserText = m.text;
      }
      searchText += ' ' + (m.text || '');
    }
    c._summary = {
      preview: firstUserText,
      imgCount: imgCount,
      turnCount: userCount,       // 以 user 提问数计轮次
      msgCount: msgs.length,
      search: searchText.toLowerCase()
    };
    return c._summary;
  }

  function applyFilter() {
    var q = state.search.trim().toLowerCase();
    state.filtered = [];
    for (var i = 0; i < state.cases.length; i++) {
      var c = state.cases[i];
      var s = summaryOf(c);
      if (!q ||
          (c.traceId && c.traceId.toLowerCase().indexOf(q) !== -1) ||
          (s.search.indexOf(q) !== -1)) {
        state.filtered.push(i);
      }
    }
    renderTable();
  }

  function renderTable() {
    var rowsHtml = '';
    for (var k = 0; k < state.filtered.length; k++) {
      var idx = state.filtered[k];
      var c = state.cases[idx];
      var s = summaryOf(c);
      rowsHtml += '<tr data-idx="' + idx + '">';
      rowsHtml += '<td class="col-idx">' + (idx + 1) + '</td>';
      rowsHtml += '<td class="col-trace"><div class="cell-trace">' + escapeHtml(c.traceId || '—') + '</div></td>';
      rowsHtml += '<td class="col-prompt"><div class="cell-prompt">' + escapeHtml(s.preview || '') + '</div></td>';
      rowsHtml += '<td class="col-images">' + badge(s.imgCount, s.imgCount ? '张图' : '无图', s.imgCount ? '' : 'muted') + '</td>';
      rowsHtml += '<td class="col-history">' + badge(s.turnCount, s.turnCount ? '轮对话' : '无对话', s.turnCount ? 'history' : 'muted') + '</td>';
      rowsHtml += '</tr>';
    }
    el['table-body'].innerHTML = rowsHtml;
    el['empty-hint'].hidden = state.filtered.length !== 0;
    el['row-count'].textContent = '共 ' + state.cases.length + ' 条' +
      (state.filtered.length !== state.cases.length ? '（筛选出 ' + state.filtered.length + '）' : '');
  }

  function badge(n, label, variant) {
    var cls = 'count-badge' + (variant ? ' count-badge--' + variant : '');
    var txt = n ? (n + ' ' + label) : label;
    return '<span class="' + cls + '">' + txt + '</span>';
  }

  /* ---------- 详情 ---------- */
  function openDetail(idx) {
    var c = state.cases[idx];
    if (!c) return;
    Yuanbao.render(c);
    showView('detail');
  }

  /* ---------- 手动粘贴实时预览 ---------- */
  var SAMPLE_MESSAGES = '[{"role":"user","content":[{"type":"text","text":"这幅书法写的是什么字？"},{"type":"image_url","image_url":{"url":"https://img02.sogoucdn.com/app/a/sample_calligraphy"}}]},{"role":"assistant","content":"这幅书法作品写的是**“观书闻香”**四字，采用行草书体，笔法奔放、墨色浓淡相宜。"},{"role":"user","content":"能详细说说它的章法特点吗？"},{"role":"assistant","content":"当然。整幅作品疏密对比强烈，行气贯通，字间以牵丝自然衔接，营造出流动的韵律感。"}]';

  function setPasteStatus(msg, kind) {
    var e = el['paste-status'];
    e.textContent = msg || '';
    e.classList.toggle('is-ok', kind === 'ok');
    e.classList.toggle('is-error', kind === 'error');
  }

  function renderPaste() {
    var raw = el['paste-textarea'].value;
    var listEl = el['paste-chat-list'];
    if (!raw.trim()) {
      listEl.innerHTML = '<div class="yb-empty">在左侧粘贴 answer_完整 内容，这里将实时还原元宝对话界面</div>';
      setPasteStatus('', null);
      return;
    }
    // 先校验 JSON，给出友好提示
    var parsedOk = true;
    try { JSON.parse(raw); } catch (e) { parsedOk = false; }

    var msgs = Parser.parseMessages(raw);
    listEl.innerHTML = Yuanbao.buildChatHtml(msgs);

    if (!parsedOk) {
      setPasteStatus('JSON 格式有误，暂无法解析', 'error');
    } else if (!msgs.length) {
      setPasteStatus('已解析，但未识别到对话消息（应为 messages 数组）', 'error');
    } else {
      var users = 0;
      for (var i = 0; i < msgs.length; i++) if (msgs[i].role === 'user') users++;
      setPasteStatus('已解析 ' + msgs.length + ' 条消息 · ' + users + ' 轮提问', 'ok');
    }
  }

  function openPaste() {
    showView('paste');
    renderPaste();
    el['paste-textarea'].focus();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    // 选择文件
    el['pick-btn'].addEventListener('click', function () { el['file-input'].click(); });
    el['dropzone'].addEventListener('click', function (e) {
      if (e.target === el['pick-btn']) return;
    });
    el['file-input'].addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
      e.target.value = '';
    });

    // 全屏拖拽
    var dragDepth = 0;
    window.addEventListener('dragenter', function (e) {
      e.preventDefault();
      if (el['view-upload'].hidden) return;
      dragDepth++;
      el['drop-overlay'].hidden = false;
    });
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('dragleave', function (e) {
      e.preventDefault();
      dragDepth--;
      if (dragDepth <= 0) { dragDepth = 0; el['drop-overlay'].hidden = true; }
    });
    window.addEventListener('drop', function (e) {
      e.preventDefault();
      dragDepth = 0;
      el['drop-overlay'].hidden = true;
      if (el['view-upload'].hidden) return;
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFile(e.dataTransfer.files[0]);
      }
    });

    // 映射对话框
    el['mapping-close'].addEventListener('click', closeMapping);
    el['mapping-cancel'].addEventListener('click', closeMapping);
    el['mapping-confirm'].addEventListener('click', confirmMapping);

    // 格式切换（分列式 / 整列式）
    if (el['mapping-format']) {
      el['mapping-format'].addEventListener('click', function (e) {
        var tab = e.target.closest('.format-tab');
        if (!tab) return;
        switchFormat(tab.getAttribute('data-format'));
      });
    }

    // 搜索
    el['search-input'].addEventListener('input', function (e) {
      state.search = e.target.value;
      applyFilter();
    });

    // 重新导入
    el['reimport-btn'].addEventListener('click', function () {
      setStatus('', false);
      showView('upload');
    });

    // 行点击 → 详情
    el['table-body'].addEventListener('click', function (e) {
      var tr = e.target.closest('tr');
      if (!tr) return;
      var idx = parseInt(tr.getAttribute('data-idx'), 10);
      if (!isNaN(idx)) openDetail(idx);
    });

    // 返回总览
    el['back-btn'].addEventListener('click', function () { showView('overview'); });

    // 手动粘贴实时预览
    el['paste-entry-btn'].addEventListener('click', openPaste);
    el['paste-back-btn'].addEventListener('click', function () { showView('upload'); });
    el['paste-textarea'].addEventListener('input', renderPaste);
    el['paste-clear-btn'].addEventListener('click', function () {
      el['paste-textarea'].value = '';
      renderPaste();
      el['paste-textarea'].focus();
    });
    el['paste-sample-btn'].addEventListener('click', function () {
      el['paste-textarea'].value = SAMPLE_MESSAGES;
      renderPaste();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    cacheEls();
    bind();
    showView('upload');
  });
})();

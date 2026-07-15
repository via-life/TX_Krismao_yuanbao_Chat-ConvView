/* ============================================================
   yuanbao.js —— 元宝对话流渲染（视图 3）
   统一渲染消息序列 case.messages = [{ role:'user'|'assistant', text, images:[] }]
   - user  → 用户气泡（靠右、浅灰底）
   - assistant → 元宝回复（靠左、纯文本、绿头像）
   - 图片优先直接渲染（像元宝网页版）；加载失败再降级为蓝色下划线链接
   - 最后一条 user 视为"当前轮次"，之前为"历史轮次"
   ============================================================ */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Markdown 文本：优先使用安全渲染器；异常时保留纯文本降级。 */
  function renderMarkdown(text) {
    if (global.MarkdownRenderer && typeof global.MarkdownRenderer.render === 'function') {
      return global.MarkdownRenderer.render(text);
    }
    return esc(text);
  }
  /* 图片 URL 列表 → 优先直接渲染 <img>；加载失败时降级为蓝色下划线链接 */
  function renderImages(images, inBubble) {
    if (!images || !images.length) return '';
    var cls = 'img-block' + (inBubble ? ' img-block--in-bubble' : '');
    var html = '<div class="' + cls + '">';
    images.forEach(function (url) {
      var u = esc(url);
      // 成功：图片可点击在新标签查看原图；
      // onerror：隐藏图片链接容器，显示其后的降级文字链接
      html += '<figure class="img-item">' +
        '<a class="img-item__link" href="' + u + '" target="_blank" rel="noopener noreferrer">' +
        '<img class="img-item__img" src="' + u + '" alt="图片" loading="lazy" ' +
        'referrerpolicy="no-referrer" ' +
        'onerror="var w=this.parentElement;w.style.display=\'none\';var f=w.nextElementSibling;if(f)f.style.display=\'inline-flex\';">' +
        '</a>' +
        '<a class="img-link img-item__fallback" href="' + u + '" target="_blank" rel="noopener noreferrer">' +
        '<span class="img-link__ico">🔗</span>' + u + '</a>' +
        '</figure>';
    });
    html += '</div>';
    return html;
  }

  function humanMsg(text, images) {
    var html = '<div class="msg msg--human"><div class="bubble-human">';
    html += renderMarkdown(text || '');
    html += renderImages(images, true);
    html += '</div></div>';
    return html;
  }

  function aiMsg(text, images) {
    var html = '<div class="msg msg--ai">';
    html += '<div class="msg__avatar">元</div>';
    html += '<div class="ai-content">';
    html += renderMarkdown(text || '');
    html += renderImages(images, false);
    html += '</div></div>';
    return html;
  }

  function sep(label, current) {
    return '<div class="turn-sep' + (current ? ' turn-sep--current' : '') + '"><span>' + esc(label) + '</span></div>';
  }

  /* 由消息序列生成对话流 HTML（详情视图与粘贴预览共用）
     messages = [{ role:'user'|'assistant', text, images:[] }] */
  function buildChatHtml(msgs) {
    msgs = msgs || [];
    if (!msgs.length) return '<div class="yb-empty">暂无可展示的对话内容</div>';

    // 最后一条 user 的下标 → 当前轮次起点
    var lastUserIdx = -1;
    for (var j = msgs.length - 1; j >= 0; j--) {
      if (msgs[j].role === 'user') { lastUserIdx = j; break; }
    }

    var html = '';
    var hasCurrentSep = false;

    // 历史轮次分隔（当存在当前轮之前的消息时）
    if (lastUserIdx > 0) html += sep('历史轮次', false);

    for (var k = 0; k < msgs.length; k++) {
      if (k === lastUserIdx) {
        html += sep('当前轮次', true);
        hasCurrentSep = true;
      }
      var m = msgs[k];
      if (m.role === 'assistant') html += aiMsg(m.text, m.images);
      else html += humanMsg(m.text, m.images);
    }

    // 若没有单独的当前轮分隔（例如只有一条消息），补一个
    if (!hasCurrentSep && lastUserIdx === 0) {
      html = sep('当前轮次', true) + html;
    }
    return html;
  }

  function firstUserText(msgs) {
    for (var i = 0; i < (msgs || []).length; i++) {
      if (msgs[i].role === 'user' && msgs[i].text) return msgs[i].text;
    }
    return '';
  }

  /* 渲染整个 case：caseData = { traceId, messages:[{role,text,images}] } */
  function render(caseData) {
    var listEl = document.getElementById('yb-chat-list');
    var badgeEl = document.getElementById('trace-badge-value');
    var titleEl = document.getElementById('yb-conv-title');

    badgeEl.textContent = caseData.traceId || '(无 trace ID)';

    var msgs = caseData.messages || [];
    if (titleEl) {
      var fu = firstUserText(msgs);
      titleEl.textContent = fu ? fu.slice(0, 18) : '当前对话';
    }

    listEl.innerHTML = buildChatHtml(msgs);
    resetScroll();
  }

  function resetScroll() {
    var scroll = document.querySelector('.yb-chat-scroll');
    if (scroll) scroll.scrollTop = 0;
  }

  global.Yuanbao = { render: render, buildChatHtml: buildChatHtml, firstUserText: firstUserText };
})(window);

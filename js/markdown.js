/* ============================================================
   markdown.js —— 安全的轻量 Markdown 渲染
   支持：段落/换行、标题、加粗/斜体/删除线、行内代码、链接、
   无序/有序列表、引用、分隔线、代码块、GFM 表格。
   原始 HTML 一律转义，避免把数据中的内容作为页面代码执行。
   ============================================================ */
(function (global) {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function safeUrl(value) {
    var url = String(value == null ? '' : value).trim();
    return /^(https?:\/\/|mailto:)/i.test(url) ? url : '';
  }

  /* 图片：与 yuanbao.js 的 renderImages 同款结构/降级逻辑，保持视觉与交互一致。
     http(s) 链接：优先渲染 <img>，加载失败时隐藏图片、显示紧邻的 🔗 降级链接。
     非 http(s)（如本地路径，出现在个别 media_info 脏数据里）：不进 href/src，只展示不可跳转的 🔗 提示，避免不安全 URL。 */
  function imageHtml(desc, url) {
    var d = esc(desc || '图片');
    var href = safeUrl(url);
    if (!href) {
      return '<span class="img-link">' +
        '<span class="img-link__ico">🔗</span>' + d + '</span>';
    }
    var u = esc(href);
    return '<figure class="img-item md-img-item">' +
      '<a class="img-item__link" href="' + u + '" target="_blank" rel="noopener noreferrer">' +
      '<img class="img-item__img" src="' + u + '" alt="' + d + '" loading="lazy" ' +
      'referrerpolicy="no-referrer" ' +
      'onerror="var w=this.parentElement;w.style.display=\'none\';var f=w.nextElementSibling;if(f)f.style.display=\'inline-flex\';">' +
      '</a>' +
      '<a class="img-link img-item__fallback" href="' + u + '" target="_blank" rel="noopener noreferrer">' +
      '<span class="img-link__ico">🔗</span>' + d + '</a>' +
      '</figure>';
  }

  var IMAGE_RE = /!\[([^\]\n]*)\]\(([^\s)]+)\)/;
  var IMAGE_LINE_RE = new RegExp('^' + IMAGE_RE.source + '$');
  var IMAGE_RE_G = new RegExp(IMAGE_RE.source, 'g');

  function inline(source) {
    var tokens = [];
    function stash(html) {
      var token = '\u0000MD' + tokens.length + '\u0000';
      tokens.push({ token: token, html: html });
      return token;
    }

    var text = String(source == null ? '' : source);
    text = text.replace(/`([^`\n]+)`/g, function (_, code) {
      return stash('<code>' + esc(code) + '</code>');
    });
    // 图片必须先于链接匹配：![desc](url) 内含 [desc](url)，否则会被下面的链接正则先吞掉
    text = text.replace(IMAGE_RE_G, function (_, desc, url) {
      var html = imageHtml(desc, url);
      return html ? stash(html) : '';
    });
    text = text.replace(/\[([^\]\n]+)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g, function (_, label, url) {
      var href = safeUrl(url);
      return href ? stash('<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + '</a>') : label;
    });
    text = esc(text);
    text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    text = text.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');

    tokens.forEach(function (item) {
      text = text.split(item.token).join(item.html);
    });
    return text;
  }

  function splitTableRow(line) {
    var source = String(line || '').trim().replace(/^\|/, '').replace(/\|$/, '');
    var cells = [];
    var cell = '';
    for (var i = 0; i < source.length; i++) {
      if (source[i] === '\\' && source[i + 1] === '|') {
        cell += '|';
        i++;
      } else if (source[i] === '|') {
        cells.push(cell.trim());
        cell = '';
      } else {
        cell += source[i];
      }
    }
    cells.push(cell.trim());
    return cells;
  }

  function isTableDivider(line) {
    var cells = splitTableRow(line);
    return cells.length > 0 && cells.every(function (cell) {
      return /^:?-{3,}:?$/.test(cell);
    });
  }

  function tableAlign(cell) {
    if (/^:-{3,}:$/.test(cell)) return 'center';
    if (/^-{3,}:$/.test(cell)) return 'right';
    return 'left';
  }

  function renderTable(headerLine, dividerLine, bodyLines) {
    var headers = splitTableRow(headerLine);
    var dividers = splitTableRow(dividerLine);
    var html = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
    headers.forEach(function (cell, index) {
      html += '<th class="md-align--' + tableAlign(dividers[index] || '') + '">' + inline(cell) + '</th>';
    });
    html += '</tr></thead>';
    if (bodyLines.length) html += '<tbody>';
    bodyLines.forEach(function (line) {
      var cells = splitTableRow(line);
      html += '<tr>';
      headers.forEach(function (_, index) {
        html += '<td class="md-align--' + tableAlign(dividers[index] || '') + '">' + inline(cells[index] || '') + '</td>';
      });
      html += '</tr>';
    });
    if (bodyLines.length) html += '</tbody>';
    return html + '</table></div>';
  }

  function renderList(lines, start) {
    var first = lines[start].match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/);
    var ordered = !!first[2];
    var pattern = ordered ? /^\s*\d+\.\s+(.+)$/ : /^\s*[-+*]\s+(.+)$/;
    var items = [];
    var i = start;
    while (i < lines.length) {
      var match = lines[i].match(pattern);
      if (!match) break;
      items.push('<li>' + inline(match[1]) + '</li>');
      i++;
    }
    return { end: i, html: '<' + (ordered ? 'ol' : 'ul') + ' class="md-list">' + items.join('') + '</' + (ordered ? 'ol' : 'ul') + '>' };
  }

  function render(source) {
    var lines = String(source == null ? '' : source).replace(/\r\n?/g, '\n').split('\n');
    var html = [];
    var paragraph = [];
    var i = 0;

    function flushParagraph() {
      if (!paragraph.length) return;
      html.push('<p>' + paragraph.map(inline).join('<br>') + '</p>');
      paragraph = [];
    }

    while (i < lines.length) {
      var line = lines[i];
      if (!line.trim()) {
        flushParagraph();
        i++;
        continue;
      }

      var imgLine = line.trim().match(IMAGE_LINE_RE);
      if (imgLine) {
        flushParagraph();
        var imgHtml = imageHtml(imgLine[1], imgLine[2]);
        if (imgHtml) html.push(imgHtml);
        i++;
        continue;
      }

      var fence = line.match(/^\s*```\s*([^\s`]*)\s*$/);
      if (fence) {
        flushParagraph();
        var code = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
          code.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++;
        var language = fence[1] ? '<span class="md-code__language">' + esc(fence[1]) + '</span>' : '';
        html.push('<pre class="md-code">' + language + '<code>' + esc(code.join('\n')) + '</code></pre>');
        continue;
      }

      var heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        flushParagraph();
        var level = heading[1].length;
        html.push('<h' + level + ' class="md-heading md-heading--' + level + '">' + inline(heading[2]) + '</h' + level + '>');
        i++;
        continue;
      }

      if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        flushParagraph();
        html.push('<hr class="md-rule">');
        i++;
        continue;
      }

      if (i + 1 < lines.length && line.indexOf('|') !== -1 && isTableDivider(lines[i + 1])) {
        flushParagraph();
        var headerLine = line;
        var dividerLine = lines[i + 1];
        var rows = [];
        i += 2;
        while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') !== -1) {
          rows.push(lines[i]);
          i++;
        }
        html.push(renderTable(headerLine, dividerLine, rows));
        continue;
      }

      if (/^\s*>\s?/.test(line)) {
        flushParagraph();
        var quote = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          quote.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        html.push('<blockquote class="md-quote">' + quote.map(inline).join('<br>') + '</blockquote>');
        continue;
      }

      if (/^\s*(?:[-+*]|\d+\.)\s+.+$/.test(line)) {
        flushParagraph();
        var list = renderList(lines, i);
        html.push(list.html);
        i = list.end;
        continue;
      }

      paragraph.push(line);
      i++;
    }
    flushParagraph();
    return html.join('');
  }

  global.MarkdownRenderer = { render: render };
})(window);

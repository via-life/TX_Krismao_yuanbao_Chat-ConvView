/* ============================================================
   lightbox.js —— 图片在页内放大查看器
   点击已渲染的图片 → 在当前页面弹出查看器，支持：
     - 缩放（滚轮 / ＋ − 按钮）
     - 拖动移动（在图片上按住拖拽）
     - 旋转（左转 / 右转 90°）
     - 还原（1:1）
   背景透明：图片之外仍可看见底层页面内容。
   关闭：点击空白处 / ✕ 按钮 / Esc。
   通过事件委托监听 .img-item__link，图片成功渲染时才拦截（失败已降级为链接）。
   ============================================================ */
(function (global) {
  'use strict';

  var MIN_SCALE = 0.1;
  var MAX_SCALE = 8;
  var ZOOM_STEP = 0.2;

  var overlay = null;   // 根遮罩
  var stage = null;     // 全屏舞台（透明、捕获空白点击）
  var imgEl = null;     // 被查看的图片

  // 变换状态
  var st = { scale: 1, rotate: 0, tx: 0, ty: 0 };
  // 拖拽状态
  var drag = { active: false, moved: false, startX: 0, startY: 0, baseX: 0, baseY: 0 };

  function build() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'lbx';
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="lbx__stage">' +
      '  <img class="lbx__img" alt="放大查看" draggable="false">' +
      '</div>' +
      '<div class="lbx__toolbar" role="toolbar">' +
      '  <button class="lbx__btn" data-act="zoom-out" title="缩小" type="button">−</button>' +
      '  <button class="lbx__btn" data-act="zoom-in" title="放大" type="button">＋</button>' +
      '  <button class="lbx__btn" data-act="reset" title="还原 1:1" type="button">1:1</button>' +
      '  <button class="lbx__btn" data-act="rotate-left" title="向左旋转" type="button">⟲</button>' +
      '  <button class="lbx__btn" data-act="rotate-right" title="向右旋转" type="button">⟳</button>' +
      '  <button class="lbx__btn lbx__btn--close" data-act="close" title="关闭" type="button">✕</button>' +
      '</div>';
    document.body.appendChild(overlay);

    stage = overlay.querySelector('.lbx__stage');
    imgEl = overlay.querySelector('.lbx__img');

    // 工具栏
    overlay.querySelector('.lbx__toolbar').addEventListener('click', function (e) {
      var btn = e.target.closest('.lbx__btn');
      if (!btn) return;
      doAction(btn.getAttribute('data-act'));
    });

    // 点击空白（舞台本身，而非图片）关闭
    stage.addEventListener('mousedown', onStageDown);
    stage.addEventListener('mousemove', onStageMove);
    stage.addEventListener('mouseup', onStageUp);
    stage.addEventListener('click', function (e) {
      if (e.target === stage && !drag.moved) close();
    });

    // 滚轮缩放（阻止页面滚动）
    overlay.addEventListener('wheel', function (e) {
      e.preventDefault();
      applyZoom(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
    }, { passive: false });

    // 拖到窗口外也能结束拖拽
    document.addEventListener('mouseup', onStageUp);
    // Esc 关闭
    document.addEventListener('keydown', function (e) {
      if (!overlay.hidden && e.key === 'Escape') close();
    });
  }

  function apply() {
    imgEl.style.transform =
      'translate(' + st.tx + 'px,' + st.ty + 'px) rotate(' + st.rotate + 'deg) scale(' + st.scale + ')';
  }

  function applyZoom(delta) {
    st.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, st.scale + delta * st.scale));
    apply();
  }

  function doAction(act) {
    switch (act) {
      case 'zoom-in': applyZoom(ZOOM_STEP); break;
      case 'zoom-out': applyZoom(-ZOOM_STEP); break;
      case 'rotate-left': st.rotate -= 90; apply(); break;
      case 'rotate-right': st.rotate += 90; apply(); break;
      case 'reset': st = { scale: 1, rotate: 0, tx: 0, ty: 0 }; apply(); break;
      case 'close': close(); break;
    }
  }

  /* —— 拖动移动 —— */
  function onStageDown(e) {
    if (e.button !== 0) return;
    drag.active = true;
    drag.moved = false;
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.baseX = st.tx;
    drag.baseY = st.ty;
    if (e.target === imgEl) e.preventDefault();
  }
  function onStageMove(e) {
    if (!drag.active) return;
    var dx = e.clientX - drag.startX;
    var dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
    st.tx = drag.baseX + dx;
    st.ty = drag.baseY + dy;
    apply();
  }
  function onStageUp() {
    drag.active = false;
    // moved 状态保留到 click 判定后由下次 down 重置
  }

  function open(src) {
    build();
    st = { scale: 1, rotate: 0, tx: 0, ty: 0 };
    imgEl.src = src;
    apply();
    overlay.hidden = false;
    document.body.classList.add('lbx-open');
  }

  function close() {
    if (!overlay) return;
    overlay.hidden = true;
    imgEl.src = '';
    document.body.classList.remove('lbx-open');
  }

  /* 事件委托：点击已成功渲染的图片 → 打开查看器 */
  document.addEventListener('click', function (e) {
    var link = e.target.closest('.img-item__link');
    if (!link) return;
    var img = link.querySelector('img.img-item__img');
    // 图片加载失败时其容器已被 onerror 隐藏，这里不会触发；双保险再判断一次
    if (img && img.style.display !== 'none' && img.naturalWidth > 0) {
      e.preventDefault();
      open(img.currentSrc || img.src);
    }
  });

  global.Lightbox = { open: open, close: close };
})(window);

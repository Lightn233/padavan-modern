/* 访客总限额和单设备限速共用接口；只有点击保存才写入配置。 */
(function (root, doc) {
    'use strict';
    var state = null, loading = null, activeEditor = null;
    var errors = {
        forbidden: '登录状态已变化，请刷新页面后重试。', conflict: '规则已在其他页面修改，请重新打开后编辑。',
        unsupported_mode: 'AP 模式不提供此限速功能；已保存的规则会在路由模式恢复。',
        unavailable: '本版固件尚未提供限速服务。', invalid_rate: '请输入 0–1000 Mbps，最多三位小数；0 为不限速。',
        invalid_device_or_full: '设备地址无效，或已达到 32 台设备的上限。', invalid_config: '限速配置无效，请检查保存的规则。',
        qdisc_conflict: '与现有自定义流控队列冲突，原队列已保留。', ingress_conflict: '入口已有其他流控，未覆盖原规则。',
        ifb_conflict: '流控接口名称被占用，未修改原接口。', missing_tc: '固件缺少流控程序。',
        accel_stop_failed: '硬件或软件加速未能暂停，限速尚未应用，请检查系统日志。',
        apply_failed: '限速未能生效，请检查系统日志。', state_write_failed: '限速状态无法保存，请检查临时空间。',
        save_failed: '配置未能保存。', apply_start_failed: '配置已保存，但服务未启动，请重试。'
    };
    function errorText(code) { return errors[code] || '无法取得限速状态，请稍后重试。'; }
    function node(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function request(data) {
        var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 8000);
        var options = { credentials: 'same-origin', cache: 'no-store', signal: controller.signal };
        if (data) { options.method = 'POST'; options.headers = { 'Content-Type': 'application/x-www-form-urlencoded' }; options.body = new URLSearchParams(data).toString(); }
        return fetch('/bandwidth.asp', options).then(function (r) {
            if (!r.ok) throw new Error(r.status === 401 ? 'forbidden' : 'network');
            return r.json();
        }).then(function (r) { if (!r.ok) throw new Error(r.error); state = r; updateButtons(); return r; })
            .finally(function () { clearTimeout(timer); });
    }
    function load() {
        if (!loading) loading = request().finally(function () { loading = null; });
        return loading;
    }
    function mbps(kbit) { return String(kbit / 1000); }
    function rate(value) {
        var s = String(value).trim();
        if (!/^\d+(?:\.\d{1,3})?$/.test(s)) throw new Error('invalid_rate');
        var n = Number(s); if (!isFinite(n) || n < 0 || n > 1000) throw new Error('invalid_rate');
        return Math.round(n * 1000);
    }
    function device(mac) { return state && state.devices.find(function (d) { return d.mac === mac; }) || { up: 0, down: 0 }; }
    function summary(rule) { return !rule.up && !rule.down ? '不限速' : '↑ ' + (rule.up ? mbps(rule.up) : '不限') + ' / ↓ ' + (rule.down ? mbps(rule.down) : '不限'); }
    function updateButtons() {
        doc.querySelectorAll('[data-bandwidth-mac]').forEach(function (b) {
            b.textContent = summary(device(b.dataset.bandwidthMac));
            b.title = '设置此设备的上传、下载上限（Mbps）';
            b.disabled = !!state && (!state.router_mode || !state.available);
            if (state && !state.router_mode) b.title = errors.unsupported_mode;
            else if (state && !state.available) b.title = errors.unavailable;
        });
    }
    function statusText(s) {
        if (s.state === 'rolled_back') return '应用失败，运行中的限速已恢复为上一组；请修改后重新保存。';
        if (s.state === 'error') return errorText(s.reason);
        if (s.state === 'unsupported_mode') return errors.unsupported_mode;
        return s.state === 'active' ? '限速已生效' : '设置已保存；没有运行中的限速（未开启访客时保留其规则）。';
    }
    function apply(data, report) {
        if (!state) return Promise.reject(new Error('unavailable'));
        data.csrf = state.csrf; data.revision = state.revision;
        report('正在保存并应用…', false);
        return request(data).then(function (saved) {
            var wanted = saved.revision, previous = saved.previous_generation, attempts = 0;
            function poll() {
                return new Promise(function (resolve) { setTimeout(resolve, 700); }).then(load).then(function (r) {
                    var s = r.status;
                    if (r.revision !== wanted) throw new Error('conflict');
                    // 旧批次的失败或成功不能结束本次保存；回退按请求修订号归属。
                    var completed = (typeof previous !== 'string' || (s.generation && s.generation !== previous)) &&
                        (s.requested_revision || s.revision) === wanted;
                    if (completed && (s.state === 'rolled_back' || s.state === 'error')) { report(statusText(s), true); return false; }
                    if (completed && s.revision === wanted && (s.state === 'active' || s.state === 'disabled' || s.state === 'unsupported_mode')) {
                        report(statusText(s), s.state === 'unsupported_mode'); return s.state !== 'unsupported_mode';
                    }
                    if (++attempts >= 25) { report('配置已保存，但尚未确认生效。请检查系统日志后刷新状态。', true); return false; }
                    return poll();
                });
            }
            return poll();
        });
    }
    function editor(host, rule, args, title, close, controls) {
        var box = node('section', 'bwl-editor'), heading = node('div', 'bwl-heading', title), fields = node('div', 'bwl-fields');
        box.appendChild(heading); box.appendChild(fields);
        function input(label, value) {
            var wrap = node('label', 'bwl-field'), caption = node('span', '', label), entry = node('input');
            entry.type = 'text'; entry.inputMode = 'decimal'; entry.value = mbps(value); entry.maxLength = 8; entry.setAttribute('aria-label', label + '，单位 Mbps');
            wrap.appendChild(caption); wrap.appendChild(entry); wrap.appendChild(node('span', 'bwl-unit', 'Mbps')); fields.appendChild(wrap); return entry;
        }
        var up = input('上传上限', rule.up), down = input('下载上限', rule.down), actions = node('div', 'bwl-actions');
        var save = node('button', 'btn btn-primary bwl-save', '保存限速'), reset = node('button', 'btn bwl-reset', '解除限速');
        save.type = reset.type = 'button'; actions.appendChild(save); actions.appendChild(reset);
        if (close) { var cancel = node('button', 'btn bwl-cancel', '取消'); cancel.type = 'button'; cancel.onclick = close; actions.appendChild(cancel); }
        var info = node('span', 'bwl-help', '使用说明'); info.tabIndex = 0;
        info.title = '0 表示不限速；下载是路由器发往设备，上传是设备发往路由器。按当前 MAC 区分设备，随机 MAC 改变后需重新设置。启用时暂停可能绕过规则的硬件 NAT 和 SFE，原加速设置保留。访客限额由该频段所有访客共享。'; actions.appendChild(info);
        box.appendChild(actions); var feedback = node('div', 'bwl-feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); box.appendChild(feedback); host.appendChild(box);
        function report(message, fail) { feedback.textContent = message; feedback.dataset.error = fail ? 'true' : 'false'; }
        function submit(clear) {
            var data;
            if (box.getAttribute('aria-busy') === 'true') return;
            try { data = Object.assign({}, args, { up: clear ? 0 : rate(up.value), down: clear ? 0 : rate(down.value) }); }
            catch (e) { report(errorText(e.message), true); return; }
            box.setAttribute('aria-busy', 'true'); save.textContent = '正在应用…';
            save.disabled = reset.disabled = true; up.disabled = down.disabled = true;
            if (cancel) cancel.disabled = true;
            if (controls) controls.busy(true);
            apply(data, report).then(function (ok) { if (ok && clear) up.value = down.value = '0'; if (ok && cancel) cancel.textContent = '完成'; })
                .catch(function (e) { report(errorText(e.message), true); })
                .finally(function () {
                    box.setAttribute('aria-busy', 'false'); save.textContent = '保存限速';
                    var disabled = !state.router_mode || !state.available;
                    save.disabled = reset.disabled = up.disabled = down.disabled = disabled;
                    if (cancel) cancel.disabled = false;
                    if (controls) controls.busy(false);
                });
        }
        save.onclick = function () { submit(false); }; reset.onclick = function () { submit(true); };
        box.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.target === up || e.target === down)) { e.preventDefault(); submit(false); } });
        [up, down].forEach(function (entry) { entry.addEventListener('input', function () { if (cancel) cancel.textContent = '取消'; feedback.textContent = ''; }); });
        if (!state.router_mode || !state.available) {
            save.disabled = reset.disabled = up.disabled = down.disabled = true;
            report(!state.router_mode ? errors.unsupported_mode : errors.unavailable, true);
        }
        return box;
    }
    function modalDocument() {
        // 设备列表位于 iframe：弹窗挂到同源的最外层页面，避免被列表高度裁切。
        var current = root;
        try { while (current.parent !== current && current.parent.document.body) current = current.parent; } catch (e) { /* 跨源时留在最后一个可访问的页面。 */ }
        return current.document;
    }
    function modalStyle(target) {
        if (target === doc) return Promise.resolve();
        var source = doc.querySelector('link[href*="/ui/bandwidth.css"]');
        if (!source) return Promise.reject(new Error('unavailable'));
        var existing = Array.from(target.querySelectorAll('link[rel="stylesheet"]')).find(function (e) { return e.href === source.href; });
        if (existing && existing.sheet) return Promise.resolve();
        return new Promise(function (resolve, reject) {
            var link = existing || target.createElement('link'), timer = setTimeout(failed, 8000);
            function finish() { clearTimeout(timer); link.removeEventListener('load', ready); link.removeEventListener('error', failed); }
            function ready() { finish(); resolve(); }
            function failed() { finish(); if (!existing) link.remove(); reject(new Error('network')); }
            link.addEventListener('load', ready); link.addEventListener('error', failed);
            if (!existing) { link.rel = 'stylesheet'; link.href = source.href; target.head.appendChild(link); }
        });
    }
    function openDevice(button, mac, name) {
        var target = modalDocument();
        return modalStyle(target).then(function () {
            if (activeEditor) activeEditor.close(true);
            var dialog = node('dialog', 'bwl-dialog'), header = node('header', 'bwl-dialog-header');
            var title = node('h2', '', '设备限速'), dismiss = node('button', 'bwl-dismiss', '×');
            title.id = 'bwl-dialog-title'; dismiss.type = 'button'; dismiss.setAttribute('aria-label', '关闭限速设置');
            dialog.setAttribute('aria-labelledby', title.id); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('role', 'dialog');
            header.appendChild(title); header.appendChild(dismiss); dialog.appendChild(header);
            var identity = node('div', 'bwl-identity'); identity.appendChild(node('strong', '', name || '此设备')); identity.appendChild(node('span', '', mac)); dialog.appendChild(identity);
            var busy = false, closed = false, shade = null, hidden = [], oldOverflow = target.documentElement.style.overflow;
            function close(force) {
                if (closed || (busy && force !== true)) return;
                closed = true; target.removeEventListener('keydown', onKey); target.removeEventListener('focusin', onFocus);
                root.removeEventListener('pagehide', unload);
                if (typeof dialog.close === 'function' && dialog.open) dialog.close();
                dialog.remove(); if (shade) shade.remove();
                hidden.forEach(function (item) { item.element.inert = item.inert; });
                target.documentElement.style.overflow = oldOverflow;
                if (activeEditor && activeEditor.element === dialog) activeEditor = null;
                var trigger = button.isConnected ? button : doc.querySelector('[data-bandwidth-mac="' + mac + '"]');
                if (trigger && force !== true) trigger.focus({ preventScroll: true });
            }
            function unload() { close(true); }
            function focusable() { return Array.from(dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')); }
            function onKey(e) {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
                if (e.key === 'Tab') {
                    var entries = focusable(), first = entries[0], last = entries[entries.length - 1];
                    if (!first) { e.preventDefault(); dialog.focus(); }
                    else if (e.shiftKey && (target.activeElement === first || !dialog.contains(target.activeElement))) { e.preventDefault(); last.focus(); }
                    else if (!e.shiftKey && (target.activeElement === last || !dialog.contains(target.activeElement))) { e.preventDefault(); first.focus(); }
                }
            }
            function onFocus(e) { if (!dialog.contains(e.target)) { var first = focusable()[0]; (first || dialog).focus(); } }
            dismiss.onclick = function () { close(); };
            dialog.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
            var box = editor(dialog, device(mac), { action: 'device', mac: mac }, '分别设置上传和下载上限', function () { close(); }, { busy: function (value) { busy = value; dismiss.disabled = value; } });
            var hint = node('p', 'bwl-hint', '单位 Mbps；填 0 表示该方向不限速。'); box.insertBefore(hint, box.querySelector('.bwl-actions'));
            dialog.tabIndex = -1; target.body.appendChild(dialog); target.documentElement.style.overflow = 'hidden';
            if (typeof dialog.showModal === 'function') dialog.showModal();
            else {
                // 旧浏览器仍保留遮罩与键盘焦点约束，表单不会提交到外层页面。
                shade = node('div', 'bwl-shade'); target.body.insertBefore(shade, dialog); dialog.setAttribute('open', '');
                Array.from(target.body.children).forEach(function (element) { if (element !== dialog && element !== shade) { hidden.push({ element: element, inert: element.inert }); element.inert = true; } });
            }
            target.addEventListener('keydown', onKey); target.addEventListener('focusin', onFocus); root.addEventListener('pagehide', unload);
            activeEditor = { element: dialog, close: close }; box.querySelector('input').focus();
        });
    }
    function addDevice(cell, mac, name) {
        mac = String(mac).replace(/[^0-9a-f]/gi, '').toUpperCase();
        if (mac.length !== 12) { cell.textContent = '—'; return; }
        mac = mac.match(/../g).join(':');
        var button = node('button', 'btn bwl-device-button', state ? summary(device(mac)) : '限速');
        button.type = 'button'; button.dataset.bandwidthMac = mac; cell.appendChild(button);
        button.setAttribute('aria-haspopup', 'dialog');
        button.onclick = function () {
            button.disabled = true; button.textContent = '正在打开…';
            load().then(function () {
                return openDevice(button, mac, name);
            }).then(updateButtons).catch(function (e) {
                updateButtons(); button.textContent = '打开失败，重试'; button.title = errorText(e.message);
            });
        };
        updateButtons();
    }
    function mountGuest() {
        doc.querySelectorAll('[data-bandwidth-guest]').forEach(function (host) {
            load().then(function (r) {
                var band = Number(host.dataset.bandwidthGuest), rule = r.guest.find(function (x) { return x.band === band; });
                host.textContent = ''; editor(host, rule, { action: 'guest', band: band }, (band === 2 ? '2.4 GHz' : '5 GHz') + ' 访客共享限额');
            }).catch(function (e) { host.textContent = errorText(e.message); });
        });
    }
    root.PadavanBandwidth = { addDevice: addDevice, load: load, rate: rate };
    doc.addEventListener('DOMContentLoaded', mountGuest);
    doc.addEventListener('DOMContentLoaded', function () { if (doc.getElementById('Clients_table')) load().catch(function () {}); });
})(window, document);

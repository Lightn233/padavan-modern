/* 通用控件与页面外壳。所有文本通过节点写入，配置内容不作为脚本执行。 */
(function(root){
    'use strict';
    var UI = root.PadavanUI = {}, doc = document, popover = null, popOwner = null, popTimer = 0, dialogQueue = Promise.resolve(), dirty = false;
    function el(tag, cls, text){var n=doc.createElement(tag); if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
    function button(text,fn,cls){var n=el('button',cls||'btn',text);n.type='button';if(fn)n.addEventListener('click',fn);return n;}
    function escapeText(value){var n=el('span','',String(value==null?'':value));return n.innerHTML;}
    UI.escape = escapeText;
    UI.dirty = function(value){if(value!==undefined){dirty=!!value;var n=doc.getElementById('uiDirty');if(n)n.classList.toggle('visible',dirty);}return dirty;};
    UI.toast = function(text){var n=el('div','ui-toast',text);n.setAttribute('role','status');doc.body.appendChild(n);setTimeout(function(){n.remove();},4500);};
    function focusable(node){return Array.from(node.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(function(n){return n.getClientRects().length;});}
    function trap(node,event){if(event.key!=='Tab')return;var items=focusable(node),first=items[0],last=items[items.length-1];if(!items.length){event.preventDefault();return;}if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}}
    UI.confirm = function(message,options){
        options=options||{};
        var task=function(){return new Promise(function(resolve){
            var previous=doc.activeElement, oldOverflow=doc.documentElement.style.overflow;
            var backdrop=el('div','ui-dialog-backdrop'),card=el('section','ui-dialog'),title=el('h2','',options.title||'确认操作'),body=el('p','',message),actions=el('div','ui-dialog-actions');
            title.id='uiConfirmTitle';body.id='uiConfirmDescription';card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-labelledby',title.id);card.setAttribute('aria-describedby',body.id);
            function finish(ok){doc.removeEventListener('keydown',keys,true);backdrop.remove();doc.documentElement.style.overflow=oldOverflow;if(previous&&previous.isConnected)previous.focus();resolve(ok);}
            var cancel=button(options.cancel||'取消',function(){finish(false);}),ok=button(options.accept||'确认继续',function(){finish(true);},'btn btn-primary');
            function keys(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(false);}else trap(card,e);}
            actions.append(cancel,ok);card.append(title,body,actions);backdrop.appendChild(card);doc.body.appendChild(backdrop);doc.documentElement.style.overflow='hidden';doc.addEventListener('keydown',keys,true);cancel.focus();
        });};
        var result=dialogQueue.then(task,task);dialogQueue=result.then(function(){},function(){});return result;
    };
    function closePopover(){clearTimeout(popTimer);if(popover)popover.remove();if(popOwner)popOwner.removeAttribute('aria-describedby');popover=null;popOwner=null;}
    function safeContent(container,html){
        var template=doc.createElement('template');template.innerHTML=String(html||'');
        var allowed=new Set(['BR','B','STRONG','EM','I','P','UL','OL','LI','CODE','SPAN','A']);
        Array.from(template.content.querySelectorAll('*')).reverse().forEach(function(n){
            if(!allowed.has(n.tagName)){n.replaceWith(doc.createTextNode(n.textContent));return;}
            var href=n.tagName==='A'?n.getAttribute('href'):null;
            Array.from(n.attributes).forEach(function(a){n.removeAttribute(a.name);});
            if(href&&(/^(https?:\/\/|\/[^/])/.test(href))){n.href=href;if(/^https?:/.test(href)){n.target='_blank';n.rel='noopener noreferrer';}}
        });container.appendChild(template.content);
    }
    UI.popover = function(owner,options){
        options=options||{};clearTimeout(popTimer);if(popOwner===owner&&popover)return;
        closePopover();popOwner=owner;popover=el('aside','ui-popover');popover.id='uiHelpPopover';popover.setAttribute('role','tooltip');owner.setAttribute('aria-describedby',popover.id);
        var close=button('×',closePopover,'ui-popover-close');close.setAttribute('aria-label','关闭帮助');popover.appendChild(close);
        popover.appendChild(el('strong','ui-popover-title',options.title||owner.getAttribute('data-original-title')||owner.getAttribute('title')||owner.textContent.trim()));
        var content=el('div');safeContent(content,options.content||owner.getAttribute('data-content')||'');popover.appendChild(content);doc.body.appendChild(popover);
        var r=owner.getBoundingClientRect(),p=popover.getBoundingClientRect(),x=Math.max(12,Math.min(innerWidth-p.width-12,r.left)),y=r.bottom+9;
        if(y+p.height>innerHeight-12)y=Math.max(12,r.top-p.height-9);
        popover.style.left=x+'px';popover.style.top=y+'px';popover.addEventListener('mouseenter',function(){clearTimeout(popTimer);});popover.addEventListener('mouseleave',function(){popTimer=setTimeout(closePopover,160);});
        owner.addEventListener('mouseleave',function(){popTimer=setTimeout(closePopover,180);},{once:true});
    };
    doc.addEventListener('keydown',function(e){if(e.key==='Escape')closePopover();});
    doc.addEventListener('pointerdown',function(e){if(popover&&!popover.contains(e.target)&&popOwner!==e.target&&!popOwner.contains(e.target))closePopover();});
    root.addEventListener('resize',closePopover);root.addEventListener('pagehide',closePopover);
    UI.switchControl=function(id,changed){
        var host=doc.getElementById(id+'_on_of'),fake=doc.getElementById(id+'_fake'),zero=doc.getElementById(id+'_0'),one=doc.getElementById(id+'_1');
        if(!host||!fake||!zero||!one)return;
        if(host._uiSwitch){host._uiSwitch.changed=changed;host._uiSwitch.sync();return;}
        fake.hidden=true;var wrap=el('span','ui-switch-wrap'),control=button('',null,'ui-switch'),label=el('span','ui-switch-label');control.setAttribute('role','switch');
        var row=host.closest('tr'),heading=row&&row.querySelector('th');control.setAttribute('aria-label',heading?heading.textContent.trim():id.replace(/_/g,' '));wrap.append(control,label);host.appendChild(wrap);
        var state={changed:changed,sync:function(){var on=one.checked;fake.checked=on;fake.value=on?'1':'0';control.setAttribute('aria-checked',String(on));control.disabled=fake.disabled||(zero.disabled&&one.disabled);label.textContent=on?'已开启':'已关闭';}};
        control.addEventListener('click',function(){if(control.disabled)return;var on=!one.checked;one.checked=on;zero.checked=!on;state.sync();UI.dirty(true);if(typeof state.changed==='function')state.changed();fake.dispatchEvent(new Event('change',{bubbles:true}));});
        one.addEventListener('change',state.sync);zero.addEventListener('change',state.sync);if(fake.form)fake.form.addEventListener('reset',function(){setTimeout(state.sync,0);});
        // 只观察原表单项，避免同步按钮自身 disabled 时再次触发观察器。
        var observer=new MutationObserver(state.sync);
        [zero,one,fake].forEach(function(input){observer.observe(input,{attributes:true,attributeFilter:['disabled','checked']});});host._uiSwitch=state;state.sync();
    };
    UI.macInput=function(input){if(!input)return;input.inputMode='text';input.maxLength=17;input.autocomplete='off';input.addEventListener('blur',function(){var raw=input.value.replace(/[:-]/g,'').trim();if(/^[0-9a-f]{12}$/i.test(raw))input.value=raw.toUpperCase().match(/.{2}/g).join(':');});};
    function modal(node,show){
        if(!node)return;if(show===undefined)show=!node.classList.contains('in');
        if(show){if(node._uiModal)return;var previous=doc.activeElement,back=el('div','modal-backdrop');doc.body.appendChild(back);node._uiModal={previous:previous,back:back};node.classList.add('in');node.setAttribute('role','dialog');node.setAttribute('aria-modal','true');node.style.display='block';var list=focusable(node);if(list[0])list[0].focus();node._uiKeys=function(e){if(e.key==='Escape'){e.preventDefault();modal(node,false);}else trap(node,e);};doc.addEventListener('keydown',node._uiKeys,true);}
        else{node.classList.remove('in');node.style.display='none';node.removeAttribute('aria-modal');if(node._uiModal){node._uiModal.back.remove();if(node._uiModal.previous.isConnected)node._uiModal.previous.focus();node._uiModal=null;}doc.removeEventListener('keydown',node._uiKeys,true);}
    }
    UI.modal=modal;
    doc.addEventListener('click',function(e){var a=e.target.closest('[data-toggle],[data-dismiss]');if(!a)return;var action=a.getAttribute('data-toggle'),dismiss=a.getAttribute('data-dismiss'),sel=a.getAttribute('data-target')||a.getAttribute('href');
        if(action==='modal'&&sel&&sel.charAt(0)==='#'){e.preventDefault();modal(doc.getElementById(sel.slice(1)),true);}
        if(dismiss==='modal'){e.preventDefault();modal(a.closest('.modal'),false);}
        if(dismiss==='alert'){e.preventDefault();var alert=a.closest('.alert');if(alert)alert.remove();}
        if(action==='collapse'&&sel&&sel.charAt(0)==='#'){e.preventDefault();var n=doc.getElementById(sel.slice(1));if(n){n.classList.toggle('in');a.setAttribute('aria-expanded',String(n.classList.contains('in')));}}
        if(action==='dropdown'){e.preventDefault();a.parentNode.classList.toggle('open');}
        if(action==='tab'&&sel&&sel.charAt(0)==='#'){e.preventDefault();var nav=a.closest('ul'),pane=doc.getElementById(sel.slice(1));if(nav)nav.querySelectorAll('.active').forEach(function(n){n.classList.remove('active');});a.parentNode.classList.add('active');if(pane){Array.from(pane.parentNode.children).forEach(function(n){n.classList.toggle('active',n===pane);});}}
    });
    // 过渡期只保留现有页面调用签名，组件本体由原生事件和 DOM 实现。
    if(root.jQuery){var $=root.jQuery;
        $.fn.iClickable=function(enabled){return this.each(function(){var id=this.id.replace(/_on_of$/,''),fake=doc.getElementById(id+'_fake');if(fake)fake.disabled=!enabled;if(this._uiSwitch)this._uiSwitch.sync();});};
        $.fn.iState=function(on){return this.each(function(){var id=this.id.replace(/_on_of$/,''),zero=doc.getElementById(id+'_0'),one=doc.getElementById(id+'_1');if(zero&&one){one.checked=on>0;zero.checked=!one.checked;if(this._uiSwitch)this._uiSwitch.sync();}});};
        $.fn.popover=function(options){return this.each(function(){var owner=this;if(typeof options==='string'){if(options==='show')UI.popover(owner);else if(options==='hide'||options==='destroy')closePopover();return;}if(owner._uiPopover)return;owner._uiPopover=true;owner.addEventListener('mouseenter',function(){UI.popover(owner,options);});owner.addEventListener('focus',function(){UI.popover(owner,options);});owner.addEventListener('click',function(e){e.preventDefault();UI.popover(owner,options);});});};
        $.fn.tooltip=$.fn.popover;
        $.fn.modal=function(action){return this.each(function(){modal(this,action==='hide'?false:action==='toggle'?undefined:true);});};
    }
    UI.mount=function(){
        var wrapper=doc.querySelector('.wrapper'),nav=doc.querySelector('.side_nav'),banner=doc.getElementById('TopBanner');
        if(!wrapper||!nav||doc.querySelector('.ui-app'))return;
        var heading=wrapper.querySelector('.box_head'),title=heading?heading.textContent.trim():doc.title.split(' - ').slice(1).join(' · ');
        if(heading&&heading.id!=='helpname')heading.classList.add('ui-page-title-source');
        var app=el('div','ui-app'),aside=el('aside','ui-sidebar'),main=el('main','ui-main'),page=el('div','ui-page'),brand=el('a','ui-brand');brand.href='/';
        brand.innerHTML='<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M8 16V6m16 10V6M5 17h22v10H5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 22h1m5 0h1m5 0h1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span><strong>PADAVAN</strong><small>NETWORK CONTROL</small></span>';
        var search=el('input','ui-nav-search');search.type='search';search.placeholder='查找设置';search.setAttribute('aria-label','查找设置');
        var scroll=el('nav','ui-nav-scroll');scroll.setAttribute('aria-label','主要导航');
        var oldColumn=nav.closest('.span3'),oldRow=oldColumn&&oldColumn.parentNode;
        if(oldRow)Array.from(oldRow.children).forEach(function(n){if(n!==oldColumn)n.classList.add('ui-content-fill');});
        scroll.appendChild(nav);if(oldColumn)oldColumn.remove();
        nav.querySelectorAll('a').forEach(function(a){if(a.closest('.active')||a.style.fontWeight==='bold')a.setAttribute('aria-current','page');a.removeAttribute('style');});
        var results=el('div','ui-search-results'),empty=el('p','ui-nav-empty','没有匹配的页面');results.hidden=true;empty.hidden=true;scroll.append(results,empty);
        var entries=[],seen=new Set();function addEntry(label,href){if(!href||!label||href.indexOf('javascript:')===0||seen.has(href))return;seen.add(href);entries.push({label:label,href:href});}
        (root.menuL1_title||[]).forEach(function(label,i){addEntry(label,(root.menuL1_link||[])[i]);});
        (root.tablink||[]).forEach(function(links,group){var category=(root.menuL2_title||[])[group+1];if(!category||!links)return;links.forEach(function(href,i){var label=(root.tabtitle[group]||[])[i];if(i&&label)addEntry(category+' / '+label,href);});});
        search.addEventListener('input',function(){var q=search.value.trim().toLowerCase();nav.hidden=!!q;results.hidden=!q;results.replaceChildren();if(q)entries.filter(function(x){return x.label.toLowerCase().indexOf(q)>=0||x.href.toLowerCase().indexOf(q)>=0;}).forEach(function(x){var a=el('a','',x.label);a.href=x.href;results.appendChild(a);});empty.hidden=!q||results.children.length>0;});
        aside.append(brand,search,scroll,el('div','ui-sidebar-foot','本地管理 · 配置保存在设备上'));
        var top=el('header','ui-topbar'),titles=el('div'),eyebrow=el('div','ui-eyebrow','设备管理 / '+(root.get_ap_mode&&root.get_ap_mode()?'接入点模式':'路由模式')),h1=el('h1','',title||'网络概览'),actions=el('div','ui-topbar-actions');titles.append(eyebrow,h1);
        var device=el('span','ui-device-label',doc.title.split(' - ')[0].replace(/^.*?\s*\|\s*/,''));
        var menu=button('☰ 菜单',function(){doc.body.classList.toggle('ui-nav-open');menu.setAttribute('aria-expanded',String(doc.body.classList.contains('ui-nav-open')));},'btn ui-menu-button');menu.setAttribute('aria-expanded','false');
        var marker=el('span','ui-dirty','有未保存的修改');marker.id='uiDirty';actions.append(marker,device,menu);top.append(titles,actions);main.appendChild(top);
        if(banner){var oldTop=banner.closest('.container-fluid');main.appendChild(banner);if(oldTop)oldTop.remove();}
        while(wrapper.firstChild)page.appendChild(wrapper.firstChild);main.appendChild(page);app.append(aside,main);wrapper.replaceWith(app);
        var backdrop=el('div','ui-nav-backdrop');backdrop.addEventListener('click',function(){doc.body.classList.remove('ui-nav-open');menu.setAttribute('aria-expanded','false');});doc.body.appendChild(backdrop);
        doc.querySelectorAll('input:not([type=hidden]),select,textarea').forEach(function(input){if(!input.getAttribute('aria-label')&&(!input.labels||!input.labels.length)){var row=input.closest('tr'),label=row&&row.querySelector('th');if(label)input.setAttribute('aria-label',label.textContent.trim());}});
        doc.querySelectorAll('a.help_tooltip').forEach(function(a){a.addEventListener('focus',function(){a.dispatchEvent(new MouseEvent('mouseover'));});a.addEventListener('click',function(e){e.preventDefault();a.dispatchEvent(new MouseEvent('mouseover'));});});
        doc.addEventListener('input',function(e){if(e.isTrusted&&e.target.form&&e.target!==search)UI.dirty(true);});doc.addEventListener('change',function(e){if(e.isTrusted&&e.target.form)UI.dirty(true);});
        doc.addEventListener('click',function(e){var a=e.target.closest('a[href]');if(!a||e.defaultPrevented||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0||a.target&&a.target!=='_self')return;var u=new URL(a.href,location.href);if(u.origin!==location.origin||u.pathname===location.pathname&&u.hash||!/^https?:/.test(u.protocol))return;if(!dirty)return;e.preventDefault();UI.confirm('当前页面有未保存的修改，离开后这些修改将丢失。',{title:'离开此页面？',accept:'放弃修改并离开'}).then(function(ok){if(ok){UI.dirty(false);location.href=u.href;}});});
    };
    root.addEventListener('beforeunload',function(e){if(dirty){e.preventDefault();e.returnValue='';}});
    // 保留浏览器原生表单编码及后端校验；提交只解除离开提示，不改字段值。
    var nativeSubmit=HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit=function(){UI.dirty(false);return nativeSubmit.call(this);};
    doc.addEventListener('submit',function(){UI.dirty(false);});
    root.addEventListener('load',UI.mount);
})(window);

// ===================== MESSAGES VIEW =====================
function renderMessages() {
    let html = `<div class="page-header"><div class="page-title">Viestit</div><div class="page-subtitle">Keskustele työkavereiden kanssa yksityisesti ja suojatusti</div></div>`;
    const colleagues = state.data.users.filter(u => u.id != state.user.id);
    
    html += `<div style="display:flex; flex-direction:column; gap:10px; max-width:600px;">`;
    colleagues.forEach(u => {
        const unread = (state.data.private_messages || []).filter(m => m.receiver_id == state.user.id && m.sender_id == u.id && m.is_read == 0).length;
        const badge = unread > 0 ? `<span class="badge" style="background:#E11D48; color:white;">${unread} uutta</span>` : '';
        html += `<div class="card card-sm" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; margin-bottom:0; transition:all 0.2s;" onclick="openChatModal(${u.id})">
            <div style="display:flex; align-items:center; gap:12px;">
                <div style="width:40px; height:40px; border-radius:50%; background:var(--accent); color:white; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:16px;">${esc(u.name.charAt(0))}</div>
                <div>
                    <div style="font-weight:700; font-size:15px; color:var(--text);">${esc(u.name)}</div>
                    <div style="font-size:12px; color:var(--text3);">${esc(u.role)}</div>
                </div>
            </div>
            <div>${badge} <i class="bi bi-chevron-right" style="color:var(--text3);"></i></div>
        </div>`;
    });
    html += `</div>`;
    return html;
}

function openChatModal(partnerId) {
    window.currentChatPartnerId = partnerId;
    
    fetch('api.php?action=mark_messages_read', { method:'POST', body: JSON.stringify({ my_id: state.user.id, chat_partner_id: partnerId }) });
    if (state.data.private_messages) {
        state.data.private_messages.forEach(m => {
            if (m.receiver_id == state.user.id && m.sender_id == partnerId) m.is_read = 1;
        });
    }

    renderChatModalContent();
}

function renderChatModalContent(keepInput = false) {
    if (!window.currentChatPartnerId) return;
    const partnerId = window.currentChatPartnerId;
    const partner = state.data.users.find(u => u.id == partnerId);
    
    const msgs = (state.data.private_messages || []).filter(m => 
        (m.sender_id == state.user.id && m.receiver_id == partnerId) || 
        (m.sender_id == partnerId && m.receiver_id == state.user.id)
    );

    let msgsHtml = '';
    if (msgs.length === 0) {
        msgsHtml = `<div style="text-align:center; color:var(--text3); font-size:13px; margin-top:auto; margin-bottom:auto;">Ei aiempia viestejä. Aloita keskustelu! Viestit salataan tallennuksessa. <i class="bi bi-lock-fill"></i></div>`;
    } else {
        msgs.forEach(m => {
            const isMe = m.sender_id == state.user.id;
            const dateObj = new Date(m.created_at.replace(' ', 'T'));
            const timeStr = dateObj.toLocaleTimeString('fi-FI', {hour: '2-digit', minute:'2-digit'});
            
            msgsHtml += `
                <div style="align-self: ${isMe ? 'flex-end' : 'flex-start'}; max-width: 85%;">
                    <div style="background: ${isMe ? 'var(--accent)' : 'var(--surface2)'}; color: ${isMe ? 'white' : 'var(--text)'}; padding: 10px 14px; border-radius: 16px; border-bottom-${isMe ? 'right' : 'left'}-radius: 4px; font-size: 14px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); line-height:1.4; word-wrap:break-word;">
                        ${esc(m.message)}
                    </div>
                    <div style="font-size:10px; color:var(--text3); margin-top:4px; text-align:${isMe ? 'right' : 'left'};">
                        ${timeStr} ${isMe && m.is_read == 1 ? '<i class="bi bi-check2-all" style="color:var(--teal)"></i>' : (isMe ? '<i class="bi bi-check2"></i>' : '')}
                    </div>
                </div>
            `;
        });
    }

    const container = document.getElementById('chat-messages-container');
    if (container && keepInput) {
        const isScrolledToBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 15;
        container.innerHTML = msgsHtml;
        if (isScrolledToBottom) container.scrollTop = container.scrollHeight;
    } else {
        const body = `
            <div id="chat-messages-container" style="height:400px; overflow-y:auto; display:flex; flex-direction:column; gap:12px; padding-right:8px; margin-bottom:16px;">
                ${msgsHtml}
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
                <input id="chat-input-msg" class="form-input" style="flex:1; border-radius:100px; padding:12px 20px; background:var(--surface2);" placeholder="Kirjoita viesti..." onkeydown="if(event.key==='Enter')sendChatMessage(${partnerId})">
                <button class="btn btn-primary btn-icon" style="border-radius:50%; width:44px; height:44px; flex-shrink:0; box-shadow:0 4px 10px rgba(225,77,42,0.3);" onclick="sendChatMessage(${partnerId})"><i class="bi bi-send-fill"></i></button>
            </div>
        `;
        openModal(partner.name, 'bi-chat-dots', body, '');
        
        setTimeout(() => {
            const newContainer = document.getElementById('chat-messages-container');
            if (newContainer) newContainer.scrollTop = newContainer.scrollHeight;
            const input = document.getElementById('chat-input-msg');
            if (input) input.focus();
        }, 50);
    }
}

async function sendChatMessage(receiverId) {
    const input = document.getElementById('chat-input-msg');
    const msg = input.value.trim();
    if (!msg) return;
    
    input.value = '';
    
    const tempMsg = {
        id: 'temp-' + Date.now(),
        sender_id: state.user.id,
        receiver_id: receiverId,
        message: msg,
        is_read: 0,
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
    };
    if (!state.data.private_messages) state.data.private_messages = [];
    state.data.private_messages.push(tempMsg);
    renderChatModalContent(true); 

    await fetch('api.php?action=send_message', { 
        method: 'POST', 
        body: JSON.stringify({ 
                        sender_id: state.user.id, 
            receiver_id: receiverId, 
            message: msg 
        }) 
    });
    
    loadSilent();
}


// ===================== LOGS & SHOPPING LIST =====================
async function addShiftLog() {
    const msg = document.getElementById('new-log-msg').value.trim();
    if(!msg) return;
    await fetch('api.php?action=add_log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, userId: state.user.id })
    });
    document.getElementById('new-log-msg').value = '';
    load();
}

async function addShopItem() {
    const item = document.getElementById('new-shop-item').value.trim();
    if(!item) return;
    await fetch('api.php?action=add_shop_item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_name: item, userId: state.user.id })
    });
    document.getElementById('new-shop-item').value = '';
    load();
}

async function completeShopItem(id) {
    await fetch('api.php?action=complete_shop_item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: id })
    });
    load();
}

// ===================== CHECKLIST ROUTINES =====================

async function toggleTask(taskId, date, isCompleted) {
    if (isCompleted) {
        state.data.task_completions.push({task_id: taskId, date: date});
    } else {
        state.data.task_completions = state.data.task_completions.filter(tc => !(tc.task_id == taskId && tc.date === date));
    }
    render();
    await fetch('api.php?action=toggle_task', { method: 'POST', body: JSON.stringify({ date: date, task_id: taskId, completed: isCompleted }) });
}

async function saveTask() { 
    const label = document.getElementById('m-task-label')?.value.trim() || document.getElementById('new-task-label')?.value.trim(); 
    if(!label) return; 
    const id = state.editingTask ? state.editingTask.id : null;
    await fetch('api.php?action=task', { method:'POST', body: JSON.stringify({ id: id, label: label, kind: document.getElementById('m-task-cash')?.checked ? 'cash' : 'normal'}) }).then(async r => { if (!r.ok) { const j = await r.json().catch(() => ({})); showToast(j.error || 'Tallennus epäonnistui'); } }); 
    if (document.getElementById('new-task-label')) document.getElementById('new-task-label').value = '';
    closeModal();
    showToast('Tehtävä tallennettu!'); load(); 
}

async function moveTask(index, direction) {
    const tasks = state.data.tasks;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= tasks.length) return;
    
    const temp = tasks[index];
    tasks[index] = tasks[newIndex];
    tasks[newIndex] = temp;
    
    render();
    
    const orderData = tasks.map((t, i) => ({ id: t.id, sort_order: i }));
    await fetch('api.php?action=reorder_tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
    });
}

async function takeOpenShift(id) {
    if (pubFeature('bidding')) return bidShift(id);
    if(!confirm('Haluatko varmasti ottaa tämän vuoron itsellesi?')) return;
    const shift = state.data.shifts.find(s => s.id == id);
    if(!shift) return;
    shift.userId = state.user.id;
        await fetch('api.php?action=shift', {method:'POST', body: JSON.stringify(shift)});
    showToast('Vuoro otettu!');
    load();
}

// Global UI State
let activePhone = null;
let sessionsData = [];
let pollingInterval = null;
let countdownInterval = null;
let isSelectionMode = false;
let selectedMessages = new Set();

// DOM Elements
const sessionsList = document.getElementById('sessionsList');
const messagesContainer = document.getElementById('messagesContainer');
const chatHeader = document.getElementById('chatHeader');
const controlsPanel = document.getElementById('controlsPanel');
const activePhoneEl = document.getElementById('activePhone');
const aiStatusBadge = document.getElementById('aiStatusBadge');
const aiToggleCheckbox = document.getElementById('aiToggleCheckbox');
const btnResume = document.getElementById('btnResume');
const chatInputArea = document.getElementById('chatInputArea');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const btnDeleteChat = document.getElementById('btnDeleteChat');
const btnSelectMode = document.getElementById('btnSelectMode');
const selectionActionBar = document.getElementById('selectionActionBar');
const selectionCount = document.getElementById('selectionCount');
const btnCancelSelection = document.getElementById('btnCancelSelection');
const btnDeleteSelected = document.getElementById('btnDeleteSelected');

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
  fetchSessions();
  
  // Start polling session lists every 3 seconds
  pollingInterval = setInterval(fetchSessions, 3000);

  // Setup Event Listeners for Pause Buttons
  document.querySelectorAll('.btn-pause').forEach(button => {
    button.addEventListener('click', (e) => {
      const minutes = e.target.getAttribute('data-time');
      pauseAI(minutes);
    });
  });

  // Resume Button Event
  btnResume.addEventListener('click', resumeAI);

  // Delete Chat Button Event
  btnDeleteChat.addEventListener('click', deleteChat);

  // Selection Mode Events
  btnSelectMode.addEventListener('click', toggleSelectionMode);
  btnCancelSelection.addEventListener('click', cancelSelectionMode);
  btnDeleteSelected.addEventListener('click', bulkDeleteSelectedMessages);

  // AI Toggle Change Event
  aiToggleCheckbox.addEventListener('change', (e) => {
    toggleAI(e.target.checked);
  });

  // Message Form Submit
  messageForm.addEventListener('submit', handleSendMessage);
});

// Fetch all active sessions
async function fetchSessions() {
  try {
    const response = await fetch('/api/sessions');
    if (!response.ok) throw new Error('Failed to fetch sessions');
    sessionsData = await response.json();
    renderSessions();
    if (activePhone) {
      updateChatHeaderState();
    }
  } catch (err) {
    console.error('Error fetching sessions:', err);
  }
}

// Render sessions list in the sidebar
function renderSessions() {
  if (sessionsData.length === 0) {
    sessionsList.innerHTML = '<div class="empty-sessions">No active chats found yet.</div>';
    return;
  }

  sessionsList.innerHTML = '';
  sessionsData.forEach(session => {
    const item = document.createElement('div');
    item.className = `session-item ${activePhone === session.phone ? 'active' : ''}`;
    item.onclick = () => selectChat(session.phone);

    // Determine status badge
    let statusText = '🤖 AI Active';
    let badgeClass = 'badge-ai';
    
    const isPaused = session.pausedUntil && session.pausedUntil > Date.now();
    if (!session.aiEnabled) {
      statusText = '👤 Manual Only';
      badgeClass = 'badge-manual';
    } else if (isPaused) {
      statusText = '⏸️ AI Paused';
      badgeClass = 'badge-paused';
    }

    item.innerHTML = `
      <div class="session-meta">
        <span class="phone-number">+${session.phone}</span>
        <span class="item-badge ${badgeClass}">${statusText}</span>
      </div>
      <div class="last-msg">${session.lastMessage || 'No messages yet'}</div>
    `;
    sessionsList.appendChild(item);
  });
}

// Select a chat to view
async function selectChat(phone) {
  activePhone = phone;
  
  // Highlight active item in sidebar
  document.querySelectorAll('.session-item').forEach(item => {
    const num = item.querySelector('.phone-number').innerText.replace('+', '');
    if (num === phone) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Show header panels and inputs
  controlsPanel.style.display = 'flex';
  aiStatusBadge.style.display = 'inline-flex';
  chatInputArea.style.display = 'block';

  // Load chat history
  await fetchChatHistory(phone);
  
  // Update header labels/controls
  updateChatHeaderState();
}

// Fetch chat history for selected phone
async function fetchChatHistory(phone) {
  try {
    const response = await fetch(`/api/chats/${phone}`);
    if (!response.ok) throw new Error('Failed to load chat history');
    const data = await response.json();
    renderMessages(data.history);
  } catch (err) {
    console.error('Error fetching history:', err);
  }
}

// Render message bubbles in chat pane
function renderMessages(history) {
  messagesContainer.innerHTML = '';
  
  // Filter out system prompt to keep conversation log clean
  const chatMessages = history.filter(msg => msg.role !== 'system');

  if (chatMessages.length === 0) {
    messagesContainer.innerHTML = '<div class="empty-state"><p>No messages in this chat history.</p></div>';
    return;
  }

  chatMessages.forEach(msg => {
    const originalIndex = history.indexOf(msg);
    const isUser = msg.role === 'user';
    
    const wrapper = document.createElement('div');
    wrapper.className = `message-bubble-wrapper ${isUser ? 'is-user' : ''}`;
    if (isSelectionMode) wrapper.classList.add('selection-mode');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'msg-checkbox';
    checkbox.checked = selectedMessages.has(originalIndex);
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedMessages.add(originalIndex);
      } else {
        selectedMessages.delete(originalIndex);
      }
      updateSelectionCount();
    });
    
    // Add click event to bubble itself for easier selection
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isUser ? 'bubble-user' : 'bubble-assistant'}`;
    bubble.onclick = (e) => {
      if (isSelectionMode) {
        // Prevent triggering if clicked on inner elements like single delete
        if (e.target.classList.contains('btn-del-msg')) return;
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      }
    };
    
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-del-msg';
    delBtn.innerHTML = '✕';
    delBtn.title = 'Delete message (for me)';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      deleteSingleMessage(originalIndex);
    };
    bubble.appendChild(delBtn);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'msg-content';
    contentDiv.innerText = msg.content;
    bubble.appendChild(contentDiv);

    if (msg.timestamp) {
      const timeDiv = document.createElement('div');
      timeDiv.className = 'msg-time';
      const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      timeDiv.innerText = timeStr;
      bubble.appendChild(timeDiv);
    }

    wrapper.appendChild(checkbox);
    wrapper.appendChild(bubble);
    messagesContainer.appendChild(wrapper);
  });

  scrollToBottom();
}

// Update Chat Header Controls and Timers
function updateChatHeaderState() {
  const session = sessionsData.find(s => s.phone === activePhone);
  if (!session) return;

  activePhoneEl.innerText = `+${session.phone}`;

  // Clear existing countdown
  clearInterval(countdownInterval);

  const isPaused = session.pausedUntil && session.pausedUntil > Date.now();

  // Reset status classes
  aiStatusBadge.className = 'status-badge';
  
  if (!session.aiEnabled) {
    aiStatusBadge.classList.add('ai-disabled');
    aiStatusBadge.querySelector('.status-text').innerText = 'Manual Only';
    aiToggleCheckbox.checked = false;
    btnResume.style.display = 'none';
  } else if (isPaused) {
    aiStatusBadge.classList.add('ai-paused');
    aiToggleCheckbox.checked = true;
    btnResume.style.display = 'inline-block';
    
    // Start live countdown timer
    startCountdown(session.pausedUntil);
  } else {
    aiStatusBadge.classList.add('ai-active');
    aiStatusBadge.querySelector('.status-text').innerText = 'AI Autoreply Active';
    aiToggleCheckbox.checked = true;
    btnResume.style.display = 'none';
  }
  btnDeleteChat.style.display = 'inline-block';
  btnSelectMode.style.display = 'inline-block';
}

// Start visual countdown for paused status
function startCountdown(pausedUntilTime) {
  const statusTextSpan = aiStatusBadge.querySelector('.status-text');

  function updateTimer() {
    const remainingMs = pausedUntilTime - Date.now();
    if (remainingMs <= 0) {
      clearInterval(countdownInterval);
      statusTextSpan.innerText = 'AI Active';
      fetchSessions(); // trigger refresh
      return;
    }

    const totalSeconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(seconds).padStart(2, '0');
    
    statusTextSpan.innerText = `AI Paused (${formattedMinutes}:${formattedSeconds})`;
  }

  updateTimer();
  countdownInterval = setInterval(updateTimer, 1000);
}

// Pause AI for active chat
async function pauseAI(minutes) {
  if (!activePhone) return;
  try {
    const response = await fetch('/api/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: activePhone, durationMinutes: minutes })
    });
    if (response.ok) {
      fetchSessions();
    }
  } catch (err) {
    console.error('Error pausing AI:', err);
  }
}

// Delete chat history
async function deleteChat() {
  if (!activePhone) return;
  const confirmDelete = confirm('Are you sure you want to delete this chat history? This action cannot be undone.');
  if (!confirmDelete) return;

  try {
    const response = await fetch(`/api/chats/${activePhone}`, {
      method: 'DELETE'
    });
    if (response.ok) {
      activePhone = null;
      chatHeader.style.display = 'none';
      chatInputArea.style.display = 'none';
      messagesContainer.innerHTML = '<div class="empty-state"><h3>Chat Deleted</h3><p>Select another chat from the sidebar.</p></div>';
      fetchSessions();
    } else {
      alert('Failed to delete chat.');
    }
  } catch (err) {
    console.error('Error deleting chat:', err);
    alert('An error occurred while deleting the chat.');
  }
}

// Delete single message
async function deleteSingleMessage(index) {
  if (!activePhone) return;
  const confirmDelete = confirm('Delete this message?');
  if (!confirmDelete) return;

  try {
    const response = await fetch(`/api/chats/${activePhone}/messages/${index}`, {
      method: 'DELETE'
    });
    if (response.ok) {
      fetchChatHistory(activePhone);
    } else {
      alert('Failed to delete message.');
    }
  } catch (err) {
    console.error('Error deleting message:', err);
    alert('An error occurred while deleting the message.');
  }
}

// --- Selection Mode Functions ---

function toggleSelectionMode() {
  isSelectionMode = true;
  selectedMessages.clear();
  selectionActionBar.style.display = 'flex';
  btnSelectMode.style.display = 'none';
  updateSelectionCount();
  fetchChatHistory(activePhone); // Re-render to show checkboxes
}

function cancelSelectionMode() {
  isSelectionMode = false;
  selectedMessages.clear();
  selectionActionBar.style.display = 'none';
  btnSelectMode.style.display = 'inline-block';
  fetchChatHistory(activePhone); // Re-render to hide checkboxes
}

function updateSelectionCount() {
  const count = selectedMessages.size;
  selectionCount.innerText = `${count} selected`;
  btnDeleteSelected.disabled = count === 0;
}

async function bulkDeleteSelectedMessages() {
  if (selectedMessages.size === 0) return;
  const confirmDelete = confirm(`Delete ${selectedMessages.size} selected messages?`);
  if (!confirmDelete) return;

  const indicesArray = Array.from(selectedMessages);
  
  try {
    const response = await fetch(`/api/chats/${activePhone}/messages/bulk-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ indices: indicesArray })
    });
    
    if (response.ok) {
      cancelSelectionMode();
    } else {
      alert('Failed to delete messages.');
    }
  } catch (err) {
    console.error('Error bulk deleting messages:', err);
    alert('An error occurred while deleting messages.');
  }
}

// Resume AI for active chat
async function resumeAI() {
  if (!activePhone) return;
  try {
    const response = await fetch('/api/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: activePhone })
    });
    if (response.ok) {
      fetchSessions();
    }
  } catch (err) {
    console.error('Error resuming AI:', err);
  }
}

// Toggle AI State for active chat
async function toggleAI(enabled) {
  if (!activePhone) return;
  try {
    const response = await fetch('/api/toggle-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: activePhone, aiEnabled: enabled })
    });
    if (response.ok) {
      fetchSessions();
    }
  } catch (err) {
    console.error('Error toggling AI state:', err);
  }
}

// Send Manual Message
async function handleSendMessage(e) {
  e.preventDefault();
  const message = messageInput.value.trim();
  if (!message || !activePhone) return;

  // Optimistic UI update: show message immediately
  const localBubble = document.createElement('div');
  localBubble.className = 'message-bubble bubble-assistant';
  const contentDiv = document.createElement('div');
  contentDiv.className = 'msg-content';
  contentDiv.innerText = message;
  localBubble.appendChild(contentDiv);

  const timeDiv = document.createElement('div');
  timeDiv.className = 'msg-time';
  timeDiv.innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  localBubble.appendChild(timeDiv);

  messagesContainer.appendChild(localBubble);
  scrollToBottom();

  messageInput.value = '';

  try {
    const response = await fetch('/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: activePhone, message: message })
    });
    
    if (response.ok) {
      fetchSessions(); // refresh state to show 5m pause
    } else {
      console.error('Send message failed');
    }
  } catch (err) {
    console.error('Error sending message:', err);
  }
}

// Auto-Scroll message window to bottom
function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

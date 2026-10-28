/**
 * app.js - Tactical Command Console Controller
 * Coordinates REST APIs, SSE real-time stream, multi-node persona switching,
 * Web Audio emergency siren, and dynamic benchmark charts.
 */

let visualizer = null;
let currentScenario = 'disaster';
let activeNodeId = null;
let networkState = null;
let eventSource = null;
let audioCtx = null;

document.addEventListener('DOMContentLoaded', () => {
    visualizer = new MeshCanvasVisualizer('meshCanvas');
    
    // Wire node move listener
    window.onNodeMoved = (nodeId, x, y) => {
        fetch('/api/nodes/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ node_id: nodeId, x: x, y: y })
        })
        .then(r => r.json())
        .then(res => {
            if (res.drained_count > 0) {
                console.log(`Drained ${res.drained_count} buffered packets!`);
            }
        });
    };

    loadState();
    setupEventStream();
});

// 1. STATE & EVENT PIPELINE
function loadState() {
    fetch('/api/state')
        .then(r => r.json())
        .then(data => {
            networkState = data;
            currentScenario = data.scenario_key;

            // Update UI elements
            document.getElementById('scenarioSelect').value = data.scenario_key;
            document.getElementById('scenarioTitle').textContent = data.scenario_title;
            document.getElementById('scenarioDesc').textContent = data.scenario_desc;

            updateTelemetry(data.metrics, data.phy_config);
            renderNodeTabs(data.nodes);
            visualizer.setData(data.nodes, data.links);

            // Populate SOS modal node select
            const sosSelect = document.getElementById('sosSourceNode');
            sosSelect.innerHTML = '';
            data.nodes.forEach(n => {
                const opt = document.createElement('option');
                opt.value = n.node_id;
                opt.textContent = `${n.name} (${n.node_id})`;
                if (n.role === 'SURVIVOR') opt.selected = true;
                sosSelect.appendChild(opt);
            });

            // Set default active node
            if (!activeNodeId || !data.nodes.find(n => n.node_id === activeNodeId)) {
                activeNodeId = data.nodes[0].node_id;
            }
            switchNodePersona(activeNodeId);
        });
}

function setupEventStream() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource('/api/events');

    eventSource.onmessage = (e) => {
        try {
            const parsed = JSON.parse(e.data);
            handleIncomingEvent(parsed.event, parsed.data);
        } catch (err) {
            console.error('SSE parse error:', err);
        }
    };

    eventSource.onerror = () => {
        console.warn('SSE connection disrupted, retrying...');
    };
}

function handleIncomingEvent(eventType, data) {
    if (eventType === 'NODE_MOVED') {
        const node = visualizer.nodes.find(n => n.node_id === data.node_id);
        if (node) {
            node.x = data.x;
            node.y = data.y;
        }
        visualizer.links = data.links;
        if (data.drained_events && data.drained_events.length > 0) {
            data.drained_events.forEach(ev => {
                if (ev.type === 'HOP') {
                    visualizer.triggerPacketHop(ev.from, ev.to, ev.packet ? ev.packet.packet_type : 'CHAT');
                }
            });
        }
    } else if (eventType === 'PACKET_TRANSMISSION') {
        animateHops(data.hop_events, 'CHAT');
        updateTelemetry(data.metrics);
        appendMessage(data.packet);
    } else if (eventType === 'SOS_ALERT') {
        playEmergencySiren();
        animateHops(data.hop_events, 'SOS');
        updateTelemetry(data.metrics);
        appendMessage(data.packet);
    } else if (eventType === 'SCENARIO_CHANGED') {
        loadState();
    } else if (eventType === 'PHY_UPDATED') {
        visualizer.links = data.links;
        document.getElementById('telemPhy').textContent = `SF${data.sf} / ${data.bw_khz}kHz`;
    }
}

function animateHops(hopEvents, type) {
    if (!hopEvents) return;
    hopEvents.forEach((ev, idx) => {
        if (ev.type === 'HOP' && ev.from && ev.to) {
            setTimeout(() => {
                visualizer.triggerPacketHop(ev.from, ev.to, type);
            }, idx * 280);
        }
    });
}

function updateTelemetry(metrics, phyConfig) {
    if (metrics) {
        document.getElementById('telemPdr').textContent = `${metrics.pdr_percent}%`;
        document.getElementById('telemDuty').textContent = `${metrics.channel_duty_cycle_pct}%`;
        document.getElementById('telemNodes').textContent = `${metrics.active_nodes_count} Online`;
    }
    if (phyConfig) {
        document.getElementById('telemPhy').textContent = `SF${phyConfig.sf} / ${phyConfig.bw_khz}kHz`;
        document.getElementById('sfSelect').value = phyConfig.sf;
        document.getElementById('txPowerSelect').value = phyConfig.tx_power_dbm;
    }
}

// 2. MULTI-NODE PERSONA SWITCHING
function renderNodeTabs(nodes) {
    const tabsContainer = document.getElementById('nodeTabs');
    tabsContainer.innerHTML = '';

    nodes.forEach(n => {
        const btn = document.createElement('button');
        btn.className = `node-tab-btn ${n.node_id === activeNodeId ? 'active' : ''}`;
        btn.id = `tab-${n.node_id}`;
        btn.textContent = `${n.name.split(' ')[0]} [${n.node_id}]`;
        btn.onclick = () => switchNodePersona(n.node_id);
        tabsContainer.appendChild(btn);
    });
}

function switchNodePersona(nodeId) {
    activeNodeId = nodeId;
    document.querySelectorAll('.node-tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`tab-${nodeId}`);
    if (activeBtn) activeBtn.classList.add('active');

    const node = visualizer.nodes.find(n => n.node_id === nodeId);
    if (!node) return;

    // Update Persona Card
    const roleElem = document.getElementById('personaRole');
    roleElem.textContent = node.role;
    roleElem.className = `role-badge ${node.role}`;
    document.getElementById('personaName').textContent = node.name;
    document.getElementById('personaCoords').textContent = `GPS: ${node.gps_lat}° N, ${node.gps_lon}° W`;
    document.getElementById('personaBattery').textContent = `${node.battery_pct}%`;
    document.getElementById('personaBuffer').textContent = `${node.buffered_count || 0} pkts`;
    document.getElementById('personaTxRx').textContent = `${node.tx_count} / ${node.rx_count}`;

    // Update target select options (cannot send to self)
    const targetSelect = document.getElementById('targetSelect');
    targetSelect.innerHTML = '<option value="BROADCAST">📢 BROADCAST (All Nodes)</option>';
    visualizer.nodes.forEach(n => {
        if (n.node_id !== nodeId) {
            const opt = document.createElement('option');
            opt.value = n.node_id;
            opt.textContent = `🎯 ${n.name} (${n.node_id})`;
            targetSelect.appendChild(opt);
        }
    });

    renderMessagesForPersona();
}

// 3. MESSAGING
function handleSendMessage(e) {
    e.preventDefault();
    const input = document.getElementById('msgInput');
    const content = input.value.trim();
    const target = document.getElementById('targetSelect').value;
    const priority = document.getElementById('prioritySelect').value;

    if (!content) return;

    fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            source_id: activeNodeId,
            target_id: target,
            content: content,
            priority: priority
        })
    })
    .then(r => r.json())
    .then(data => {
        input.value = '';
    });
}

function quickSend(text) {
    document.getElementById('msgInput').value = text;
    document.getElementById('btnSend').click();
}

function renderMessagesForPersona() {
    const container = document.getElementById('messagesContainer');
    container.innerHTML = '';

    if (!networkState || !networkState.recent_packets || networkState.recent_packets.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📡</div>
                <p>Mesh Radio Listening on 868.1 MHz...</p>
                <small>Zero internet connection required. All packets route peer-to-peer.</small>
            </div>
        `;
        return;
    }

    networkState.recent_packets.forEach(pkt => {
        appendMessageCard(pkt, container);
    });
    container.scrollTop = container.scrollHeight;
}

function appendMessage(pkt) {
    if (!networkState.recent_packets) networkState.recent_packets = [];
    networkState.recent_packets.push(pkt);

    const container = document.getElementById('messagesContainer');
    // Remove empty state if present
    const empty = container.querySelector('.empty-state');
    if (empty) empty.remove();

    appendMessageCard(pkt, container);
    container.scrollTop = container.scrollHeight;
}

function appendMessageCard(pkt, container) {
    const isSelf = pkt.source_id === activeNodeId;
    const isSos = pkt.packet_type === 'SOS';

    const card = document.createElement('div');
    card.className = `msg-card ${isSos ? 'msg-sos' : (isSelf ? 'msg-outgoing' : 'msg-incoming')}`;

    const routeStr = pkt.route_history && pkt.route_history.length > 0
        ? pkt.route_history.join(' ➔ ')
        : (isSelf ? 'Direct TX' : 'Unknown');

    let bodyContent = '';
    if (isSos) {
        const payload = pkt.payload;
        bodyContent = `
            <div style="color: #ef4444; font-weight: 700; margin-bottom: 4px;">
                🚨 EMERGENCY SOS [TRIAGE: ${payload.triage}] (${payload.people_count || 1} Persons)
            </div>
            <div><strong>Medical:</strong> ${payload.injuries || 'None'}</div>
            <div><strong>Needs:</strong> ${payload.supplies || 'Evacuation'}</div>
            <div><strong>Notes:</strong> ${payload.notes || ''}</div>
            <div style="font-family: var(--font-mono); font-size: 0.7rem; color: #fbbf24; margin-top: 4px;">
                GPS: ${payload.gps ? `${payload.gps.lat}° N, ${payload.gps.lon}° W` : 'Unknown'}
            </div>
        `;
    } else {
        bodyContent = pkt.payload.text || JSON.stringify(pkt.payload);
    }

    card.innerHTML = `
        <div class="msg-header">
            <span class="msg-sender">${isSelf ? 'YOU (' + pkt.source_id + ')' : pkt.source_id} ➔ ${pkt.target_id}</span>
            <span class="msg-time">${new Date(pkt.timestamp * 1000).toLocaleTimeString()}</span>
        </div>
        <div class="msg-body">${bodyContent}</div>
        <div class="msg-meta">
            <span class="msg-hops">Hops: ${pkt.hop_count || (pkt.route_history ? pkt.route_history.length - 1 : 0)} (${routeStr})</span>
            <span>Delivery: ${pkt.delivery_time_ms ? pkt.delivery_time_ms + 'ms' : 'Sent'}</span>
        </div>
    `;

    container.appendChild(card);
}

// 4. EMERGENCY SOS
function openSosModal() {
    document.getElementById('sosModal').classList.remove('hidden');
}

function dispatchSosAlert() {
    const triage = document.querySelector('input[name="triageLevel"]:checked').value;
    const sourceNode = document.getElementById('sosSourceNode').value;
    const people = document.getElementById('sosPeople').value;
    const injuries = document.getElementById('sosInjuries').value;
    const supplies = document.getElementById('sosSupplies').value;
    const notes = document.getElementById('sosNotes').value;

    fetch('/api/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            source_id: sourceNode,
            triage: triage,
            people_count: people,
            injuries: injuries,
            supplies: supplies,
            notes: notes
        })
    })
    .then(r => r.json())
    .then(() => {
        closeModal('sosModal');
    });
}

function playEmergencySiren() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.type = 'sawtooth';
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);

        // Siren dual-pitch glide
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(950, audioCtx.currentTime + 0.3);
        osc.frequency.linearRampToValueAtTime(600, audioCtx.currentTime + 0.6);
        osc.frequency.linearRampToValueAtTime(950, audioCtx.currentTime + 0.9);

        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 1.2);
    } catch (e) {
        console.warn('Audio siren context blocked or unsupported:', e);
    }
}

// 5. MISSION CONTROLS & BENCHMARKS
function changeScenario(key) {
    fetch('/api/scenario/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_key: key })
    })
    .then(r => r.json())
    .then(data => {
        loadState();
    });
}

function updateRadioParams() {
    const sf = document.getElementById('sfSelect').value;
    const tx = document.getElementById('txPowerSelect').value;

    fetch('/api/phy/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sf: sf, tx_power_dbm: tx })
    });
}

function resetNodePositions() {
    loadState();
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

function openNetworkModal() {
    document.getElementById('networkModal').classList.remove('hidden');
    fetch('/api/network_info')
        .then(r => r.json())
        .then(info => {
            document.getElementById('lanUrlInput').value = info.local_url;
        });
}

function copyNetUrl(inputId) {
    const input = document.getElementById(inputId);
    input.select();
    navigator.clipboard.writeText(input.value).then(() => {
        alert('Copied link: ' + input.value);
    }).catch(() => {
        document.execCommand('copy');
        alert('Copied link: ' + input.value);
    });
}

function openBenchmarkModal() {
    document.getElementById('benchModal').classList.remove('hidden');
    fetch('/api/benchmarks')
        .then(r => r.json())
        .then(benchData => {
            renderBenchmarkCharts(benchData);
        });
}

function switchBenchTab(tabId) {
    document.querySelectorAll('.bench-tab-pane').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.bench-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.remove('hidden');
    event.target.classList.add('active');
}

function renderBenchmarkCharts(data) {
    // 1. PDR Table & Canvas Chart
    const pdrTableBody = document.querySelector('#pdrTable tbody');
    pdrTableBody.innerHTML = '';
    data.pdr_vs_distance.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.distance_km} km</td>
            <td>${row.rssi_dbm} dBm</td>
            <td>${row.snr_db} dB</td>
            <td style="color: ${row.pdr_percent > 80 ? '#10b981' : '#f59e0b'}; font-weight: 700;">${row.pdr_percent}%</td>
            <td><span class="role-badge" style="font-size:0.6rem;">${row.quality}</span></td>
        `;
        pdrTableBody.appendChild(tr);
    });

    drawPdrChart(data.pdr_vs_distance);

    // 2. Latency Table & Canvas Chart
    const latTableBody = document.querySelector('#latencyTable tbody');
    latTableBody.innerHTML = '';
    const missionUses = {
        'SF7': 'Short Range / Base Perimeter',
        'SF8': 'Mobile Convoy Telemetry',
        'SF9': 'Tactical Search & Rescue (Standard)',
        'SF10': 'Long Range Hilltop Relays',
        'SF11': 'Heavy Forest / Debris Penetration',
        'SF12': 'Extreme SOS Beaconing (>10km)'
    };
    data.sf_vs_latency.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${row.spreading_factor}</strong></td>
            <td>${row.sensitivity_dbm} dBm</td>
            <td>${row.toa_125khz_ms} ms</td>
            <td>${row.toa_250khz_ms} ms</td>
            <td style="color: var(--color-cyan);">${missionUses[row.spreading_factor] || 'General'}</td>
        `;
        latTableBody.appendChild(tr);
    });
    drawLatencyChart(data.sf_vs_latency);

    // 3. Battery Longevity Cards
    const bat = data.battery_comparison;
    const batContainer = document.getElementById('batteryCards');
    batContainer.innerHTML = `
        <div class="battery-card" style="border-left: 4px solid #ef4444;">
            <h4>4G LTE Smartphone (Dead Zone)</h4>
            <p style="color: var(--text-muted); font-size: 0.75rem;">Continuous power amplifier hunt for cell tower in disaster zone.</p>
            <div class="battery-val" style="color: #ef4444;">${bat.cellular_search_hours} Hours</div>
            <p style="color: var(--text-secondary); font-size: 0.75rem;">Phone completely dead in ~${bat.cellular_search_days} days.</p>
        </div>
        <div class="battery-card" style="border-left: 4px solid #10b981;">
            <h4>ResQMesh LoRa Node (2000mAh)</h4>
            <p style="color: var(--text-muted); font-size: 0.75rem;">Deep sleep mode with sub-GHz synchronized radio bursts.</p>
            <div class="battery-val" style="color: #10b981;">${bat.lora_beacon_days}+ Days</div>
            <p style="color: var(--color-gold); font-size: 0.75rem; font-weight: 700;">${Math.round(bat.battery_advantage_multiplier)}x Longer Operating Lifetime</p>
        </div>
    `;

    // 4. Multi-Hop Table
    const hopsTableBody = document.querySelector('#hopsTable tbody');
    hopsTableBody.innerHTML = '';
    data.hop_reliability.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.hops} Hop${row.hops > 1 ? 's' : ''}</td>
            <td style="color: #10b981; font-weight: 700;">${row.end_to_end_pdr_pct}%</td>
            <td>${row.avg_latency_ms} ms</td>
            <td style="color: var(--text-muted);">&lt; 0.05% duty-cycle</td>
        `;
        hopsTableBody.appendChild(tr);
    });
}

function drawPdrChart(data) {
    const canvas = document.getElementById('pdrChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const pad = 40;
    const plotW = w - pad * 2;
    const plotH = h - pad * 2;

    // Draw Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, pad);
    ctx.lineTo(pad, h - pad);
    ctx.lineTo(w - pad, h - pad);
    ctx.stroke();

    // Axis Labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px "JetBrains Mono"';
    ctx.textAlign = 'right';
    ctx.fillText('100%', pad - 5, pad + 10);
    ctx.fillText('50%', pad - 5, pad + plotH / 2);
    ctx.fillText('0%', pad - 5, h - pad);

    ctx.textAlign = 'center';
    ctx.fillText('Distance (km)', w / 2, h - 8);

    // Plot PDR Curve
    ctx.beginPath();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.5;

    data.forEach((pt, i) => {
        const x = pad + (i / (data.length - 1)) * plotW;
        const y = (h - pad) - (pt.pdr_percent / 100.0) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Plot points
    data.forEach((pt, i) => {
        const x = pad + (i / (data.length - 1)) * plotW;
        const y = (h - pad) - (pt.pdr_percent / 100.0) * plotH;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#06b6d4';
        ctx.fill();

        ctx.fillStyle = '#f1f5f9';
        ctx.font = '9px "JetBrains Mono"';
        ctx.fillText(`${pt.distance_km}k`, x, h - pad + 15);
    });
}

function drawLatencyChart(data) {
    const canvas = document.getElementById('latencyChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const pad = 40;
    const barWidth = 35;
    const maxToa = 2000.0;
    const plotH = h - pad * 2;

    // Draw Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, pad);
    ctx.lineTo(pad, h - pad);
    ctx.lineTo(w - pad, h - pad);
    ctx.stroke();

    data.forEach((row, idx) => {
        const x = pad + 30 + idx * 85;
        const barH = (row.toa_125khz_ms / maxToa) * plotH;
        const y = (h - pad) - barH;

        ctx.fillStyle = '#0284c7';
        ctx.fillRect(x, y, barWidth, barH);

        // Bar label
        ctx.fillStyle = '#f1f5f9';
        ctx.font = '10px "JetBrains Mono"';
        ctx.textAlign = 'center';
        ctx.fillText(row.spreading_factor, x + barWidth / 2, h - pad + 15);
        ctx.fillText(`${Math.round(row.toa_125khz_ms)}ms`, x + barWidth / 2, y - 5);
    });
}

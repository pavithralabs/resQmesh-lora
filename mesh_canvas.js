/**
 * mesh_canvas.js - Interactive HTML5 Canvas Mesh Visualizer
 * Renders draggable nodes, dynamic RF signal propagation links,
 * and animated packet hops with real-time LoRa physics.
 */

class MeshCanvasVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.nodes = [];
        this.links = [];
        this.activePackets = []; // In-flight animated pulses: [{from, to, progress, color, type}]
        this.draggedNode = null;
        this.dragOffset = { x: 0, y: 0 };
        this.hoveredLink = null;
        this.hoveredNode = null;
        this.tooltip = document.getElementById('linkTooltip');

        this.initCanvasSize();
        this.bindEvents();
        this.startRenderLoop();
    }

    initCanvasSize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        window.addEventListener('resize', () => {
            const r = this.canvas.parentElement.getBoundingClientRect();
            this.canvas.width = r.width;
            this.canvas.height = r.height;
        });
    }

    setData(nodes, links) {
        this.nodes = nodes;
        this.links = links;
    }

    findNodeAt(x, y) {
        for (let i = this.nodes.length - 1; i >= 0; i--) {
            const n = this.nodes[i];
            const dx = x - n.x;
            const dy = y - n.y;
            if (Math.sqrt(dx * dx + dy * dy) <= 24) {
                return n;
            }
        }
        return null;
    }

    bindEvents() {
        this.canvas.addEventListener('mousedown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const node = this.findNodeAt(x, y);
            if (node) {
                this.draggedNode = node;
                this.dragOffset.x = x - node.x;
                this.dragOffset.y = y - node.y;
            }
        });

        window.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            if (this.draggedNode) {
                this.draggedNode.x = Math.max(30, Math.min(this.canvas.width - 30, x - this.dragOffset.x));
                this.draggedNode.y = Math.max(30, Math.min(this.canvas.height - 30, y - this.dragOffset.y));
            } else {
                // Check hover for tooltip
                this.checkHover(x, y);
            }
        });

        window.addEventListener('mouseup', () => {
            if (this.draggedNode) {
                const node = this.draggedNode;
                this.draggedNode = null;
                // Dispatch move update to backend
                if (window.onNodeMoved) {
                    window.onNodeMoved(node.node_id, node.x, node.y);
                }
            }
        });
    }

    checkHover(x, y) {
        // Node hover
        this.hoveredNode = this.findNodeAt(x, y);
        if (this.hoveredNode) {
            this.showTooltip(x + 15, y + 15, `
                <strong>${this.hoveredNode.name}</strong><br>
                ID: ${this.hoveredNode.node_id} | Role: ${this.hoveredNode.role}<br>
                Battery: ${this.hoveredNode.battery_pct}% | Tx/Rx: ${this.hoveredNode.tx_count}/${this.hoveredNode.rx_count}
            `);
            return;
        }

        // Link hover
        let linkFound = null;
        for (const l of this.links) {
            const n1 = this.nodes.find(n => n.node_id === l.node1);
            const n2 = this.nodes.find(n => n.node_id === l.node2);
            if (!n1 || !n2) continue;

            // Distance to line segment
            const dist = this.distToSegment({ x, y }, { x: n1.x, y: n1.y }, { x: n2.x, y: n2.y });
            if (dist < 8) {
                linkFound = l;
                break;
            }
        }

        if (linkFound) {
            this.hoveredLink = linkFound;
            const km = (linkFound.distance_m / 1000).toFixed(2);
            this.showTooltip(x + 15, y + 15, `
                <strong>RF Link: ${linkFound.node1} ↔ ${linkFound.node2}</strong><br>
                Distance: ${km} km (${linkFound.distance_m} m)<br>
                RSSI: ${linkFound.rssi} dBm | SNR: ${linkFound.snr} dB<br>
                Delivery Probability: ${linkFound.pdr}% [${linkFound.quality}]
            `);
        } else {
            this.hoveredLink = null;
            this.hideTooltip();
        }
    }

    distToSegment(p, v, w) {
        const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
        if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
    }

    showTooltip(x, y, html) {
        if (!this.tooltip) return;
        this.tooltip.innerHTML = html;
        this.tooltip.style.left = `${Math.min(x, this.canvas.width - 240)}px`;
        this.tooltip.style.top = `${Math.min(y, this.canvas.height - 100)}px`;
        this.tooltip.classList.remove('hidden');
    }

    hideTooltip() {
        if (this.tooltip) this.tooltip.classList.add('hidden');
    }

    triggerPacketHop(fromId, toId, type = 'CHAT') {
        const fromNode = this.nodes.find(n => n.node_id === fromId);
        const toNode = this.nodes.find(n => n.node_id === toId);
        if (!fromNode || !toNode) return;

        this.activePackets.push({
            fromX: fromNode.x,
            fromY: fromNode.y,
            toX: toNode.x,
            toY: toNode.y,
            progress: 0.0,
            speed: 0.025, // animation step
            type: type,
            color: type === 'SOS' ? '#ef4444' : '#06b6d4'
        });
    }

    startRenderLoop() {
        const render = () => {
            this.draw();
            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    }

    draw() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        // 1. Draw Subtle Range Rings around origin
        ctx.strokeStyle = 'rgba(56, 75, 105, 0.15)';
        ctx.lineWidth = 1;
        for (let r = 80; r < Math.max(w, h); r += 120) {
            ctx.beginPath();
            ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 2. Draw Radio Propagation Links
        for (const l of this.links) {
            const n1 = this.nodes.find(n => n.node_id === l.node1);
            const n2 = this.nodes.find(n => n.node_id === l.node2);
            if (!n1 || !n2) continue;

            ctx.beginPath();
            ctx.moveTo(n1.x, n1.y);
            ctx.lineTo(n2.x, n2.y);

            if (l.connected) {
                if (l.rssi > -85) {
                    ctx.strokeStyle = 'rgba(16, 185, 129, 0.7)'; // Green
                    ctx.lineWidth = 2.0;
                    ctx.setLineDash([]);
                } else if (l.rssi > -110) {
                    ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)'; // Amber
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([]);
                } else {
                    ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; // Marginal
                    ctx.lineWidth = 1.2;
                    ctx.setLineDash([4, 4]);
                }
            } else {
                ctx.strokeStyle = 'rgba(239, 68, 68, 0.15)'; // Disconnected
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 6]);
            }

            ctx.stroke();
            ctx.setLineDash([]);

            // Draw link distance label in center
            const midX = (n1.x + n2.x) / 2;
            const midY = (n1.y + n2.y) / 2;
            ctx.fillStyle = l.connected ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.4)';
            ctx.font = '9px "JetBrains Mono"';
            ctx.textAlign = 'center';
            const km = (l.distance_m / 1000).toFixed(1);
            ctx.fillText(`${km}km`, midX, midY - 3);
        }

        // 3. Draw Animated In-Flight Packets
        for (let i = this.activePackets.length - 1; i >= 0; i--) {
            const p = this.activePackets[i];
            p.progress += p.speed;

            const currX = p.fromX + (p.toX - p.fromX) * p.progress;
            const currY = p.fromY + (p.toY - p.fromY) * p.progress;

            // Draw glowing pulse
            ctx.save();
            ctx.beginPath();
            ctx.arc(currX, currY, p.type === 'SOS' ? 8 : 6, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 12;
            ctx.fill();

            // Ring expansion
            ctx.beginPath();
            ctx.arc(currX, currY, 12, 0, Math.PI * 2);
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();

            if (p.progress >= 1.0) {
                this.activePackets.splice(i, 1);
            }
        }

        // 4. Draw Mesh Nodes
        for (const node of this.nodes) {
            this.drawNode(node);
        }
    }

    drawNode(node) {
        const ctx = this.ctx;
        const x = node.x;
        const y = node.y;

        // Role-based styling
        let badgeColor = '#06b6d4';
        let icon = '📡';
        if (node.role === 'COMMAND') {
            badgeColor = '#10b981';
            icon = '🏛️';
        } else if (node.role === 'RESCUE') {
            badgeColor = '#0284c7';
            icon = '⛑️';
        } else if (node.role === 'RELAY') {
            badgeColor = '#f59e0b';
            icon = '📶';
        } else if (node.role === 'SURVIVOR') {
            badgeColor = '#ef4444';
            icon = '🆘';
        }

        // Outer glow
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 22, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = badgeColor;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = badgeColor;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Node Icon inside
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon, x, y);

        // Node ID label under node
        ctx.font = 'bold 10px "JetBrains Mono"';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(node.node_id, x, y + 34);

        // Role label
        ctx.font = '8px "JetBrains Mono"';
        ctx.fillStyle = badgeColor;
        ctx.fillText(`[${node.role}]`, x, y + 45);

        // Battery indicator dot
        const batColor = node.battery_pct > 50 ? '#10b981' : (node.battery_pct > 20 ? '#f59e0b' : '#ef4444');
        ctx.beginPath();
        ctx.arc(x + 16, y - 16, 4, 0, Math.PI * 2);
        ctx.fillStyle = batColor;
        ctx.fill();
    }
}

window.MeshCanvasVisualizer = MeshCanvasVisualizer;

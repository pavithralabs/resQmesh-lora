"""
app.py - ResQMesh Standalone Server & Real-Time Event Dispatcher
Flask-based backend with Server-Sent Events (SSE) for live packet hop animation,
REST endpoints for multi-node messaging, SOS emergency dispatcher, and benchmarks.
"""

import time
import json
import queue
from flask import Flask, render_template, request, jsonify, Response
from lora_phy import LoRaPHY
from mesh_router import MeshNetwork, MeshNode, MeshPacket
from scenarios import get_scenario
from test_benchmarks import run_all_benchmarks

app = Flask(__name__)

# Global Network State
phy = LoRaPHY(spreading_factor=9, bandwidth_khz=125, tx_power_dbm=14.0)
network = MeshNetwork(phy=phy)
current_scenario_key = 'disaster'

# SSE Subscribers Queue List
event_queues = []

def init_scenario(scenario_key):
    global network, current_scenario_key
    current_scenario_key = scenario_key
    sc_data = get_scenario(scenario_key)
    network = MeshNetwork(phy=phy)
    for node in sc_data['nodes']:
        network.add_node(node)

init_scenario('disaster')

def broadcast_event(event_type, data):
    """Pushes event to all active SSE browser connections."""
    message = json.dumps({'event': event_type, 'data': data})
    dead_queues = []
    for q in event_queues:
        try:
            q.put_nowait(message)
        except queue.Full:
            dead_queues.append(q)
    for dq in dead_queues:
        if dq in event_queues:
            event_queues.remove(dq)


@app.route('/')
def index():
    return render_template('index.html')


import socket

def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

@app.route('/api/network_info', methods=['GET'])
def get_network_info():
    ip = get_lan_ip()
    return jsonify({
        'local_ip': ip,
        'local_url': f"http://{ip}:5000",
        'localhost_url': "http://localhost:5000"
    })

@app.route('/api/state', methods=['GET'])
def get_state():
    sc_data = get_scenario(current_scenario_key)
    nodes_data = [n.to_dict() for n in network.nodes.values()]
    links_data = network.get_topology()
    metrics = network.get_metrics()
    lan_ip = get_lan_ip()
    
    # Recent delivered or logged packets
    recent_packets = [p.to_dict() for p in network.packet_log[-20:]]

    return jsonify({
        'scenario_key': current_scenario_key,
        'scenario_title': sc_data['title'],
        'scenario_subtitle': sc_data['subtitle'],
        'scenario_desc': sc_data['description'],
        'nodes': nodes_data,
        'links': links_data,
        'metrics': metrics,
        'recent_packets': recent_packets,
        'phy_config': {
            'sf': phy.sf,
            'bw_khz': phy.bw_khz,
            'tx_power_dbm': phy.tx_power,
            'freq_mhz': phy.freq_mhz
        },
        'network_info': {
            'local_ip': lan_ip,
            'local_url': f"http://{lan_ip}:5000"
        }
    })


@app.route('/api/nodes/move', methods=['POST'])
def move_node():
    data = request.json or {}
    node_id = data.get('node_id')
    x = data.get('x')
    y = data.get('y')

    node = network.get_node(node_id)
    if not node:
        return jsonify({'error': 'Node not found'}), 404

    node.x = float(x)
    node.y = float(y)

    # Check if any store-and-forward buffered packets can now be drained
    drained_events = network.drain_store_and_forward()

    # Broadcast node move and new links
    links = network.get_topology()
    broadcast_event('NODE_MOVED', {
        'node_id': node_id,
        'x': node.x,
        'y': node.y,
        'links': links,
        'drained_events': [e for e in drained_events if isinstance(e, dict)]
    })

    return jsonify({
        'status': 'success',
        'node': node.to_dict(),
        'drained_count': len(drained_events)
    })


@app.route('/api/send', methods=['POST'])
def send_message():
    data = request.json or {}
    source_id = data.get('source_id')
    target_id = data.get('target_id', 'BROADCAST')
    content = data.get('content', '')
    priority = int(data.get('priority', MeshPacket.PRIORITY_NORMAL))

    if not source_id or not content:
        return jsonify({'error': 'Missing source_id or content'}), 400

    pkt = MeshPacket(
        source_id=source_id,
        target_id=target_id,
        payload={'text': content},
        packet_type=MeshPacket.TYPE_CHAT,
        priority=priority
    )

    hop_events = network.send_packet(pkt)

    # Broadcast live hop sequence to SSE listeners
    broadcast_event('PACKET_TRANSMISSION', {
        'packet': pkt.to_dict(),
        'hop_events': hop_events,
        'metrics': network.get_metrics()
    })

    return jsonify({
        'status': 'dispatched',
        'packet': pkt.to_dict(),
        'hop_events': hop_events
    })


@app.route('/api/sos', methods=['POST'])
def send_sos():
    data = request.json or {}
    source_id = data.get('source_id')
    triage = data.get('triage', 'RED') # RED, YELLOW, GREEN
    injuries = data.get('injuries', 'Crush injuries, dehydration')
    supplies = data.get('supplies', 'Medical kit, clean water, rescue boat')
    people_count = data.get('people_count', 4)
    notes = data.get('notes', 'Water rising rapidly, stranded on roof')

    node = network.get_node(source_id)
    if not node:
        return jsonify({'error': 'Node not found'}), 404

    sos_payload = {
        'triage': triage,
        'people_count': people_count,
        'injuries': injuries,
        'supplies': supplies,
        'notes': notes,
        'gps': {'lat': node.gps_lat, 'lon': node.gps_lon}
    }

    pkt = MeshPacket(
        source_id=source_id,
        target_id='BROADCAST',
        payload=sos_payload,
        packet_type=MeshPacket.TYPE_SOS,
        priority=MeshPacket.PRIORITY_SOS,
        max_ttl=5 # Maximum reach for life-saving emergencies
    )

    hop_events = network.send_packet(pkt)

    broadcast_event('SOS_ALERT', {
        'packet': pkt.to_dict(),
        'hop_events': hop_events,
        'sos_payload': sos_payload,
        'metrics': network.get_metrics()
    })

    return jsonify({
        'status': 'sos_broadcasted',
        'packet': pkt.to_dict(),
        'hop_events': hop_events
    })


@app.route('/api/scenario/load', methods=['POST'])
def load_scenario():
    data = request.json or {}
    key = data.get('scenario_key', 'disaster')
    init_scenario(key)
    
    broadcast_event('SCENARIO_CHANGED', {
        'scenario_key': key,
        'state': get_state().get_json()
    })

    return get_state()


@app.route('/api/phy/update', methods=['POST'])
def update_phy():
    data = request.json or {}
    if 'sf' in data:
        phy.sf = int(data['sf'])
    if 'bw_khz' in data:
        phy.bw_khz = int(data['bw_khz'])
    if 'tx_power_dbm' in data:
        phy.tx_power = float(data['tx_power_dbm'])

    links = network.get_topology()
    broadcast_event('PHY_UPDATED', {
        'sf': phy.sf,
        'bw_khz': phy.bw_khz,
        'tx_power_dbm': phy.tx_power,
        'links': links
    })
    return jsonify({'status': 'updated', 'sf': phy.sf, 'bw_khz': phy.bw_khz, 'tx_power': phy.tx_power})


@app.route('/api/benchmarks', methods=['GET'])
def get_benchmarks():
    data = run_all_benchmarks()
    return jsonify(data)


@app.route('/api/events')
def sse_events():
    def event_stream():
        q = queue.Queue(maxsize=50)
        event_queues.append(q)
        try:
            # Send initial keepalive
            yield f"data: {json.dumps({'event': 'CONNECTED'})}\n\n"
            while True:
                msg = q.get()
                yield f"data: {msg}\n\n"
        except GeneratorExit:
            if q in event_queues:
                event_queues.remove(q)

    return Response(event_stream(), mimetype="text/event-stream")


if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5000))
    print(f"ResQMesh Server starting on http://localhost:{port} ...")
    app.run(host='0.0.0.0', port=port)

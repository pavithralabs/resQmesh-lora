"""
scenarios.py - Real-Time Mission Scenarios for ResQMesh
Configures pre-built test environments tailored for jury demonstration:
1. Disaster Relief & Grid Collapse (Floods / Earthquakes)
2. Search & Rescue (Alpine SAR & Drone Relay)
3. Wilderness Expedition & Store-and-Forward
4. Tactical Perimeter Resilience
"""

from mesh_router import MeshNode

def get_scenario(scenario_key):
    scenarios = {
        'disaster': {
            'title': 'Disaster Relief & Power Grid Collapse',
            'subtitle': 'Simulating post-hurricane / earthquake cell blackout in rural valley',
            'description': 'Cellular towers and power grids are offline. Trapped civilians are cut off behind a flooded river (~8.5 km from Command HQ). Direct radio is blocked by terrain, requiring a Hilltop Relay to deliver emergency SOS medical alerts.',
            'nodes': [
                MeshNode('HQ-COMMAND', 'Incident Command HQ', MeshNode.ROLE_COMMAND, 110, 260, 34.0522, -118.2437, 98.5),
                MeshNode('RESCUE-ALPHA', 'Ground Rescue Alpha', MeshNode.ROLE_RESCUE, 290, 150, 34.0580, -118.2310, 91.2),
                MeshNode('RELAY-HILLTOP', 'Hilltop Solar Repeater', MeshNode.ROLE_RELAY, 470, 260, 34.0620, -118.2150, 95.0),
                MeshNode('SURVIVOR-SOS', 'Survivor Beacon (Flood Zone)', MeshNode.ROLE_SURVIVOR, 690, 260, 34.0710, -118.1990, 78.4)
            ]
        },
        'sar': {
            'title': 'Alpine Search & Rescue (SAR)',
            'subtitle': 'Locating injured mountaineer in zero-coverage mountain pass',
            'description': 'A mountaineer is stranded on an alpine ridge. Deep granite walls prevent direct radio to Base Camp. A tethered emergency relay drone bridges the signal to the mobile search team and Base.',
            'nodes': [
                MeshNode('BASE-CAMP', 'Base Camp Operations', MeshNode.ROLE_COMMAND, 120, 360, 46.2044, 6.1432, 99.0),
                MeshNode('DRONE-RELAY', 'Tethered Drone Relay', MeshNode.ROLE_RELAY, 320, 220, 46.2150, 6.1550, 84.0),
                MeshNode('SEARCH-TEAM-1', 'SAR Alpine Unit 1', MeshNode.ROLE_RESCUE, 510, 160, 46.2260, 6.1680, 89.5),
                MeshNode('LOST-HIKER', 'Stranded Hiker Beacon', MeshNode.ROLE_SURVIVOR, 710, 110, 46.2390, 6.1820, 42.0)
            ]
        },
        'expedition': {
            'title': 'Remote Wilderness Expedition (Store & Forward)',
            'subtitle': 'Demonstrating asynchronous packet buffering behind canyon ridges',
            'description': 'A remote expedition team traverses a deep canyon where radio contact is temporarily lost. Messages are buffered in the local store-and-forward queue and automatically dispatched when a mobile relay arrives.',
            'nodes': [
                MeshNode('EXPED-BASE', 'Trailhead Base Camp', MeshNode.ROLE_COMMAND, 100, 250, -3.4653, -62.2159, 97.0),
                MeshNode('SCOUT-UNIT', 'Forward Scout Team', MeshNode.ROLE_EXPEDITION, 720, 250, -3.4900, -62.1700, 65.0),
                MeshNode('PATROL-ROVER', 'Patrol Rover (Relay)', MeshNode.ROLE_RELAY, 380, 420, -3.4780, -62.1950, 88.0)
            ]
        },
        'tactical': {
            'title': 'Tactical Mesh Resilience & Multi-Path',
            'subtitle': 'Censorship-resistant peer mesh with self-healing routing',
            'description': 'A tactical mesh network with multiple redundant nodes. Demonstrates how peer-to-peer packets dynamically find alternate paths even when specific nodes are jammed or go offline.',
            'nodes': [
                MeshNode('TAC-HQ', 'Operations Center', MeshNode.ROLE_COMMAND, 100, 250, 37.7749, -122.4194, 100.0),
                MeshNode('TAC-NODE-A', 'Team North', MeshNode.ROLE_RESCUE, 300, 120, 37.7810, -122.4100, 92.0),
                MeshNode('TAC-NODE-B', 'Team South', MeshNode.ROLE_RESCUE, 300, 380, 37.7680, -122.4120, 89.0),
                MeshNode('TAC-RELAY', 'Perimeter Relay', MeshNode.ROLE_RELAY, 500, 250, 37.7750, -122.3980, 96.0),
                MeshNode('TAC-RECON', 'Forward Recon Unit', MeshNode.ROLE_EXPEDITION, 700, 250, 37.7790, -122.3850, 74.0)
            ]
        }
    }
    return scenarios.get(scenario_key, scenarios['disaster'])

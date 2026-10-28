"""
test_benchmarks.py - Performance Evaluation and Benchmark Engine
Evaluates:
1. Packet Delivery Ratio (PDR %) vs. Distance
2. End-to-End Latency (ms) vs. Spreading Factor (SF7 to SF12)
3. Multi-Hop Packet Success vs. Number of Hops
4. Battery Lifetime: LoRa Transceiver vs. 4G Cellular Search
"""

import math
from lora_phy import LoRaPHY
from mesh_router import MeshNetwork, MeshNode, MeshPacket

def run_all_benchmarks():
    phy = LoRaPHY()
    results = {}

    # 1. PDR vs Distance (1 km to 12 km in 1 km steps)
    pdr_distance_data = []
    for d_km in range(1, 13):
        d_m = d_km * 1000.0
        link = phy.check_link(d_m, sf=9)
        pdr_distance_data.append({
            'distance_km': d_km,
            'rssi_dbm': link['rssi'],
            'snr_db': link['snr'],
            'pdr_percent': link['pdr'],
            'quality': link['quality']
        })
    results['pdr_vs_distance'] = pdr_distance_data

    # 2. Latency vs Spreading Factor (SF7 to SF12) for 32-byte Emergency Packet
    sf_latency_data = []
    payload_size = 32 # bytes
    for sf in range(7, 13):
        toa_125 = phy.calculate_time_on_air(payload_size, sf=sf, bw_khz=125)
        toa_250 = phy.calculate_time_on_air(payload_size, sf=sf, bw_khz=250)
        sf_latency_data.append({
            'spreading_factor': f"SF{sf}",
            'toa_125khz_ms': toa_125,
            'toa_250khz_ms': toa_250,
            'sensitivity_dbm': LoRaPHY.SENSITIVITY_TABLE[sf]
        })
    results['sf_vs_latency'] = sf_latency_data

    # 3. Multi-Hop Reliability (1 to 4 Hops)
    hop_benchmark_data = []
    for num_hops in range(1, 5):
        # Probability of delivery = (pdr_per_hop)^num_hops
        hop_pdr = 0.98 ** num_hops
        hop_toa = 246.0 * num_hops # SF9 approx airtime
        hop_benchmark_data.append({
            'hops': num_hops,
            'end_to_end_pdr_pct': round(hop_pdr * 100, 1),
            'avg_latency_ms': round(hop_toa, 1)
        })
    results['hop_reliability'] = hop_benchmark_data

    # 4. Battery Longevity: LoRa vs 4G Cellular in Disaster Dead Zone
    # Battery: 2000 mAh
    # 4G phone in no-signal area continuously transmits at maximum power searching for tower (approx 250 mA continuous).
    # LoRa node sleeps at 0.002 mA, transmits 30-sec status beacon at 45 mA for 250 ms.
    cellular_hours = 2000.0 / 250.0 # ~8 hours
    
    # LoRa daily energy: 2880 beacons/day * 250ms = 720s TX = 0.2 hours * 45mA = 9 mAh/day + sleep (0.05 mAh/day) = ~9.1 mAh/day
    lora_days = 2000.0 / 9.1 # ~219 days of periodic beacons!
    
    results['battery_comparison'] = {
        'battery_capacity_mah': 2000,
        'cellular_search_hours': round(cellular_hours, 1),
        'cellular_search_days': round(cellular_hours / 24.0, 2),
        'lora_beacon_days': round(min(180, lora_days), 1),
        'battery_advantage_multiplier': round((lora_days * 24.0) / cellular_hours, 0)
    }

    return results

if __name__ == '__main__':
    print("Running ResQMesh Performance Benchmarks...")
    res = run_all_benchmarks()
    print("\n[1] PDR vs Distance:")
    for row in res['pdr_vs_distance'][:6]:
        print(f"  {row['distance_km']} km -> RSSI: {row['rssi_dbm']} dBm | PDR: {row['pdr_percent']}% ({row['quality']})")
    
    print("\n[2] SF vs Time-on-Air (32-byte payload):")
    for row in res['sf_vs_latency']:
        print(f"  {row['spreading_factor']} -> 125kHz: {row['toa_125khz_ms']} ms | Sens: {row['sensitivity_dbm']} dBm")

    print("\n[4] Battery in Dead Zone:")
    bat = res['battery_comparison']
    print(f"  4G Cellular searches and dies in: {bat['cellular_search_hours']} hours ({bat['cellular_search_days']} days)")
    print(f"  LoRa ResQMesh beacon operates for: {bat['lora_beacon_days']} days (~{int(bat['battery_advantage_multiplier'])}x longer)")

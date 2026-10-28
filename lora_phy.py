"""
lora_phy.py - Virtual LoRa Radio Physical Layer (PHY) Simulator
Accurately models radio frequency propagation, path loss, RSSI, SNR,
receiver sensitivity, and Semtech Time-on-Air (ToA) formulas.
"""

import math
import random

class LoRaPHY:
    # Sensitivity threshold per Spreading Factor (at 125 kHz BW) in dBm
    SENSITIVITY_TABLE = {
        7: -123.0,
        8: -126.0,
        9: -129.0,
        10: -132.0,
        11: -134.5,
        12: -137.0
    }

    # Minimum Demodulation SNR threshold in dB
    MIN_SNR_TABLE = {
        7: -7.5,
        8: -10.0,
        9: -12.5,
        10: -15.0,
        11: -17.5,
        12: -20.0
    }

    def __init__(self, 
                 frequency_mhz=868.1, 
                 bandwidth_khz=125, 
                 spreading_factor=9, 
                 coding_rate=1, # 1 corresponds to 4/5
                 tx_power_dbm=14.0, 
                 antenna_gain_dbi=2.15,
                 path_loss_exponent=2.8, # Rural/Open terrain
                 noise_floor_dbm=-116.0):
        self.freq_mhz = frequency_mhz
        self.bw_khz = bandwidth_khz
        self.sf = spreading_factor
        self.cr = coding_rate
        self.tx_power = tx_power_dbm
        self.antenna_gain = antenna_gain_dbi
        self.gamma = path_loss_exponent
        self.noise_floor = noise_floor_dbm
        self.d0 = 100.0 # Reference distance in meters
        self.pl_d0 = 71.2 # Friis free-space path loss at 100m for 868 MHz (dB)

    def calculate_distance_meters(self, pos1, pos2, meters_per_pixel=15.0):
        """Calculate real-world distance in meters from canvas pixel coordinates."""
        dx = pos1[0] - pos2[0]
        dy = pos1[1] - pos2[1]
        dist_pixels = math.sqrt(dx * dx + dy * dy)
        return max(1.0, dist_pixels * meters_per_pixel)

    def calculate_rssi(self, distance_m, tx_power=None, shadowing_std=1.5):
        """
        Log-Distance Path Loss Model with Shadowing:
        RSSI = Tx_Power + Gains - (PL_0 + 10 * gamma * log10(d / d0) + X_sigma)
        """
        p_tx = tx_power if tx_power is not None else self.tx_power
        
        # Safe distance ratio
        ratio = max(1.0, distance_m / self.d0)
        path_loss = self.pl_d0 + (10.0 * self.gamma * math.log10(ratio))
        
        # Small gaussian shadowing variation
        shadowing = random.gauss(0, shadowing_std)
        
        rssi = p_tx + (2 * self.antenna_gain) - path_loss - shadowing
        return round(rssi, 1)

    def calculate_snr(self, rssi_dbm):
        """Calculate Signal-to-Noise Ratio (SNR) in dB."""
        snr = rssi_dbm - self.noise_floor
        # Add slight atmospheric noise
        snr += random.uniform(-0.5, 0.5)
        return round(snr, 1)

    def check_link(self, distance_m, sf=None):
        """
        Evaluate if a radio link can be formed between two points.
        Returns: { 'connected': bool, 'rssi': float, 'snr': float, 'pdr': float, 'quality': str }
        """
        active_sf = sf if sf is not None else self.sf
        rssi = self.calculate_rssi(distance_m)
        snr = self.calculate_snr(rssi)
        
        sens_thresh = self.SENSITIVITY_TABLE.get(active_sf, -129.0)
        min_snr = self.MIN_SNR_TABLE.get(active_sf, -12.5)

        # Margin above sensitivity
        margin_sens = rssi - sens_thresh
        margin_snr = snr - min_snr

        if margin_sens < 0 or margin_snr < 0:
            return {
                'connected': False,
                'rssi': rssi,
                'snr': snr,
                'pdr': 0.0,
                'quality': 'DISCONNECTED',
                'distance_m': round(distance_m, 1)
            }

        # Sigmoid-based Packet Delivery Ratio (PDR) model based on link margin
        effective_margin = min(margin_sens, margin_snr)
        # 0 margin -> ~50% delivery, >5dB margin -> >98% delivery
        pdr = 1.0 / (1.0 + math.exp(-0.8 * effective_margin))
        pdr = min(1.0, max(0.05, pdr))

        if rssi > -85:
            quality = 'EXCELLENT'
        elif rssi > -105:
            quality = 'GOOD'
        elif rssi > -120:
            quality = 'MARGINAL'
        else:
            quality = 'WEAK'

        return {
            'connected': True,
            'rssi': rssi,
            'snr': snr,
            'pdr': round(pdr * 100, 1),
            'quality': quality,
            'distance_m': round(distance_m, 1)
        }

    def calculate_time_on_air(self, payload_bytes, sf=None, bw_khz=None, cr=None, preamble_len=8):
        """
        Semtech Standard LoRa Time-on-Air (ToA) calculation in milliseconds.
        Ref: Semtech SX1276/77/78/79 datasheet section 4.1.1.6
        """
        active_sf = sf if sf is not None else self.sf
        active_bw = bw_khz if bw_khz is not None else self.bw_khz
        active_cr = cr if cr is not None else self.cr

        # Symbol duration in ms: Ts = (2^SF) / BW(kHz)
        t_sym = (2 ** active_sf) / (active_bw * 1000.0) * 1000.0 # ms

        # Preamble duration: (N_preamble + 4.25) * Ts
        t_preamble = (preamble_len + 4.25) * t_sym

        # Payload symbol count
        # Explicit header mode (H=0), CRC enabled (CRC=1), LowDataRateOptimize (DE=1 if SF>=11 and BW=125)
        h = 0
        de = 1 if (active_sf >= 11 and active_bw <= 125) else 0
        crc = 1

        term1 = 8 * payload_bytes - 4 * active_sf + 28 + 16 * crc - 20 * h
        term2 = 4 * (active_sf - 2 * de)
        payload_sym_nb = 8 + max(0, math.ceil(term1 / term2) * (active_cr + 4))

        t_payload = payload_sym_nb * t_sym
        total_toa_ms = t_preamble + t_payload
        return round(total_toa_ms, 2)

    def calculate_energy_consumption(self, toa_ms, tx_power_dbm=14.0):
        """
        Estimate energy consumed per packet in milliampere-hours (mAh).
        SX1262 LoRa transceiver draws ~45mA @ 14dBm, ~118mA @ 22dBm.
        """
        # Current draw in mA
        current_ma = 45.0 if tx_power_dbm <= 14 else (45.0 + (tx_power_dbm - 14) * 9.0)
        # Convert ms to hours
        hours = (toa_ms / 1000.0) / 3600.0
        mah = current_ma * hours
        return round(mah, 6)

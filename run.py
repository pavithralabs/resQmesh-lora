"""
run.py - Universal Network Launcher for ResQMesh
Starts the local server and creates an instant global public HTTPS tunnel
so anyone on ANY network (cellular 4G/5G, remote Wi-Fi, worldwide) can access the project.
"""

import sys
import os
import time
import socket
import subprocess
import re
import webbrowser
import threading

def get_local_ip():
    """Detect LAN Wi-Fi IP address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    local_ip = get_local_ip()

    print("=" * 70)
    print("   ResQMesh: Internet-Independent Tactical LoRa P2P Network")
    print("   Launching Universal Multi-Network Access Engine...")
    print("=" * 70)

    # 1. Start Flask Server in background subprocess
    server_proc = subprocess.Popen([sys.executable, "app.py"])

    # 2. Start Cloudflare Tunnel if available
    cloudflared_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cloudflared.exe")
    public_url = None
    tunnel_proc = None

    if os.path.exists(cloudflared_path):
        print("\n[+] Establishing Secure Global HTTPS Tunnel (Any Network Access)...")
        tunnel_proc = subprocess.Popen(
            [cloudflared_path, "tunnel", "--url", "http://localhost:5000"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )

        # Read tunnel logs to extract public URL
        start_wait = time.time()
        while time.time() - start_wait < 15:
            line = tunnel_proc.stderr.readline()
            if not line:
                time.sleep(0.1)
                continue
            match = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line)
            if match:
                public_url = match.group(0)
                break

    print("\n" + "=" * 70)
    print("                🚀 RESQMESH IS NOW LIVE EVERYWHERE!                 ")
    print("=" * 70)
    print(f" [1] THIS COMPUTER (Localhost):")
    print(f"     👉 http://localhost:5000")
    print()
    print(f" [2] SAME WI-FI / HOTSPOT (Share with phones/laptops connected to your Wi-Fi):")
    print(f"     👉 http://{local_ip}:5000")
    print()
    if public_url:
        print(f" [3] ANY NETWORK IN THE WORLD (Share with judges on Mobile 4G/5G or Remote):")
        print(f"     👉 {public_url}")
    print("=" * 70)
    print(" Press Ctrl+C in this window at any time to stop the server.\n")

    # Automatically open local browser
    webbrowser.open("http://localhost:5000")

    try:
        server_proc.wait()
    except KeyboardInterrupt:
        print("\n[!] Shutting down server and tunnels...")
        server_proc.terminate()
        if tunnel_proc:
            tunnel_proc.terminate()
        print("[✓] Clean shutdown complete.")

if __name__ == '__main__':
    main()

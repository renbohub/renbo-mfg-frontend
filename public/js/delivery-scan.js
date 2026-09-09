(function () {
  const form = document.getElementById("delivery-lookup"); const input = document.getElementById("delivery-reference");
  const status = document.getElementById("delivery-scan-status"); const result = document.getElementById("delivery-scan-result"); const video = document.getElementById("delivery-video");
  const startButton = document.getElementById("delivery-camera"); const stopButton = document.getElementById("delivery-camera-stop");
  let stream = null; let timer = null; let busy = false; let cameraGeneration = 0;
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  function stopCamera() { cameraGeneration += 1; clearTimeout(timer); stream?.getTracks().forEach((track) => track.stop()); stream = null; video.srcObject = null; video.hidden = true; stopButton.hidden = true; startButton.disabled = false; }
  async function lookup() {
    if (busy) return;
    if (!/^(?:ERP:DELIVERY:)?[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(input.value.trim())) { status.textContent = "QR bukan referensi surat jalan ERP yang valid."; return; }
    busy = true; form.querySelector("button").disabled = true; result.replaceChildren(); status.textContent = "Memeriksa pengiriman...";
    try {
      const response = await fetch(`/modules/api/outgoing/delivery-schedules/lookup?reference=${encodeURIComponent(input.value.trim())}`, { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store" });
      const item = await response.json();
      if (response.status === 401) { location.replace(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
      if (!response.ok) throw new Error(item.message || "Pengiriman tidak ditemukan.");
      const data = item.data || item;
      status.textContent = `${data.scheduleNumber} · ${data.soNumber} · ${data.status}`;
      const link = document.createElement("a"); link.className = "btn btn-primary"; link.textContent = "Buka pengiriman";
      link.href = `/modules/outgoing/delivery-schedules/${encodeURIComponent(data.scheduleNumber)}`; result.append(link);
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; form.querySelector("button").disabled = false; }
  }
  form.addEventListener("submit", (event) => { event.preventDefault(); stopCamera(); lookup(); });
  startButton.addEventListener("click", async () => {
    if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) { status.textContent = "Kamera QR tidak didukung browser ini. Gunakan scanner USB/Bluetooth atau ketik nomor surat jalan."; return; }
    const generation = ++cameraGeneration; startButton.disabled = true;
    try {
      const formats = await BarcodeDetector.getSupportedFormats();
      if (!formats.includes("qr_code")) throw new Error("Browser belum mendukung QR. Gunakan scanner atau nomor surat jalan.");
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      if (generation !== cameraGeneration || document.hidden) { acquired.getTracks().forEach((track) => track.stop()); return; }
      stream = acquired; video.srcObject = stream; video.hidden = false; stopButton.hidden = false; await video.play(); status.textContent = "Arahkan kamera ke QR pada surat jalan.";
      const scan = async () => {
        if (generation !== cameraGeneration || !stream) return;
        try { const codes = await detector.detect(video); if (codes[0]?.rawValue) { input.value = codes[0].rawValue; stopCamera(); await lookup(); return; } } catch { /* Wait for a complete video frame. */ }
        if (generation === cameraGeneration) timer = setTimeout(scan, 300);
      };
      scan();
    } catch (error) { if (generation === cameraGeneration) { stopCamera(); status.textContent = error.name === "NotAllowedError" ? "Izin kamera ditolak. Gunakan scanner atau masukkan nomor surat jalan." : error.message; } }
  });
  stopButton.addEventListener("click", stopCamera);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopCamera(); });
  window.addEventListener("pagehide", stopCamera);
  input.focus();
})();

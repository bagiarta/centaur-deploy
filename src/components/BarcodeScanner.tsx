import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanFailure?: (error: any) => void;
  onClose: () => void;
  title?: string;
}

export function BarcodeScanner({ onScanSuccess, onScanFailure, onClose, title = "Scan Barcode" }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const readerId = "qr-reader-element";

  useEffect(() => {
    // Request camera permissions and get list of devices
    Html5Qrcode.getCameras().then(devices => {
      if (devices && devices.length) {
        setCameras(devices);
        // Usually the back camera is the last one or has "back" in the name
        const backCamera = devices.find(d => d.label.toLowerCase().includes('back')) || devices[devices.length - 1];
        setSelectedCamera(backCamera.id);
      } else {
        setError("No cameras found on this device.");
      }
    }).catch(err => {
      setError(`Camera access denied or not available: ${err.message}`);
    });

    return () => {
      stopScanner();
    };
  }, []);

  const startScanner = (cameraId: string) => {
    if (scannerRef.current?.isScanning) {
      stopScanner().then(() => {
        startScannerInternal(cameraId);
      });
    } else {
      startScannerInternal(cameraId);
    }
  };

  const startScannerInternal = (cameraId: string) => {
    if (!cameraId) return;
    
    setError(null);
    const html5QrCode = new Html5Qrcode(readerId);
    scannerRef.current = html5QrCode;
    
    html5QrCode.start(
      cameraId,
      {
        fps: 10,
        qrbox: { width: 250, height: 100 },
        aspectRatio: 1.0
      },
      (decodedText) => {
        // Success
        // Stop scanning after successful scan
        stopScanner().then(() => {
          onScanSuccess(decodedText);
        });
      },
      (errorMessage) => {
        // Failure, usually just means no barcode in view yet
        if (onScanFailure) {
          onScanFailure(errorMessage);
        }
      }
    ).then(() => {
      setIsScanning(true);
    }).catch(err => {
      setError(`Failed to start scanner: ${err.message}`);
      setIsScanning(false);
    });
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        setIsScanning(false);
      } catch (err) {
        console.error("Failed to stop scanner", err);
      }
    }
  };

  useEffect(() => {
    if (selectedCamera && !isScanning && !error) {
       startScanner(selectedCamera);
    }
  }, [selectedCamera, error]);

  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCameraId = e.target.value;
    setSelectedCamera(newCameraId);
    startScanner(newCameraId);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] animate-fade-in p-4 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 bg-surface-raised flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-foreground text-sm">{title}</h3>
          </div>
          <button 
            onClick={() => {
              stopScanner().then(() => onClose());
            }}
            className="p-1.5 hover:bg-white/10 rounded-lg text-foreground-muted hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scanner Area */}
        <div className="p-4 flex flex-col gap-4">
          {error ? (
            <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-center">
              <p className="text-danger text-sm font-medium mb-2">{error}</p>
              <button 
                onClick={() => {
                  setError(null);
                  Html5Qrcode.getCameras().then(devices => {
                    if (devices && devices.length) {
                      setCameras(devices);
                      setSelectedCamera(devices[0].id);
                    }
                  });
                }}
                className="px-4 py-2 bg-danger/20 text-danger hover:bg-danger/30 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Try Again
              </button>
            </div>
          ) : (
            <>
              {cameras.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-foreground-muted uppercase tracking-wider">Select Camera</label>
                  <select 
                    value={selectedCamera}
                    onChange={handleCameraChange}
                    className="bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  >
                    {cameras.map(cam => (
                      <option key={cam.id} value={cam.id}>{cam.label || `Camera ${cam.id.substring(0, 5)}...`}</option>
                    ))}
                  </select>
                </div>
              )}
              
              <div className="relative rounded-xl overflow-hidden border border-border bg-black aspect-square flex items-center justify-center">
                <div id={readerId} className="w-full h-full" style={{ width: '100%', minHeight: '300px' }}></div>
                {!isScanning && !error && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 gap-3">
                    <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-white text-xs font-medium">Initializing camera...</p>
                  </div>
                )}
                {isScanning && (
                  <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none">
                    <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                      <p className="text-white text-[10px] font-medium tracking-wide uppercase flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
                        Scanning for Barcode...
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-center text-[11px] text-foreground-muted mt-2">
                Position the barcode inside the frame to scan automatically.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

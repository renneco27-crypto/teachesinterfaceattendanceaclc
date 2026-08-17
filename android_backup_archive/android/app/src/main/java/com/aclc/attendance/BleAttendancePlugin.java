package com.aclc.attendance;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(
  name = "BleAttendance",
  permissions = {
    @Permission(alias = "scan", strings = { Manifest.permission.BLUETOOTH_SCAN }),
    @Permission(alias = "advertise", strings = { Manifest.permission.BLUETOOTH_ADVERTISE }),
    @Permission(alias = "connect", strings = { Manifest.permission.BLUETOOTH_CONNECT })
  }
)
public class BleAttendancePlugin extends Plugin {

  private static final UUID SERVICE_UUID = UUID.fromString("7a3a2e1e-6c4a-4e0e-a5a1-2b6c3d4e5f60");
  private static final UUID CHALLENGE_UUID = UUID.fromString("7a3a2e1e-6c4a-4e0e-a5a1-2b6c3d4e5f61");
  private static final UUID SIGNATURE_UUID = UUID.fromString("7a3a2e1e-6c4a-4e0e-a5a1-2b6c3d4e5f62");
  private static final int MANUFACTURER_ID = 0xAC0C;
  private static final int MAX_SIGNATURE_READS = 40;
  private static final long SIGNATURE_READ_DELAY_MS = 250;

  private final Handler handler = new Handler(Looper.getMainLooper());
  private final ConcurrentHashMap<String, BluetoothGatt> gatts = new ConcurrentHashMap<>();
  private final ConcurrentHashMap<String, String> fingerprintByAddress = new ConcurrentHashMap<>();

  private BluetoothManager bluetoothManager;
  private BluetoothLeScanner scanner;
  private BluetoothLeAdvertiser advertiser;
  private BluetoothGattServer gattServer;
  private boolean scanning = false;
  private boolean advertising = false;
  private byte[] challengeBytes = null;
  private byte[] signatureBytes = null;

  private BluetoothManager manager() {
    if (bluetoothManager == null) {
      bluetoothManager = getContext().getSystemService(Context.BLUETOOTH_SERVICE);
    }
    return bluetoothManager;
  }

  private boolean hasBlePermissions() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
    Context ctx = getContext();
    return ContextCompat.checkSelfPermission(ctx, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
      && ContextCompat.checkSelfPermission(ctx, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
      && ContextCompat.checkSelfPermission(ctx, Manifest.permission.BLUETOOTH_ADVERTISE) == PackageManager.PERMISSION_GRANTED;
  }

  private BluetoothAdapter adapterOrNull() {
    BluetoothAdapter adapter = manager() != null ? manager().getAdapter() : null;
    return (adapter != null && adapter.isEnabled()) ? adapter : null;
  }

  @PluginMethod
  public void startScan(PluginCall call) {
    if (!hasBlePermissions()) {
      call.reject("BLUETOOTH_PERMISSION_DENIED");
      return;
    }
    BluetoothAdapter adapter = adapterOrNull();
    if (adapter == null) {
      call.reject("BLUETOOTH_OFF");
      return;
    }
    if (scanning) {
      call.resolve();
      return;
    }
    scanner = adapter.getBluetoothLeScanner();
    if (scanner == null) {
      call.reject("BLUETOOTH_UNSUPPORTED");
      return;
    }
    ScanFilter filter = new ScanFilter.Builder()
      .setServiceUuid(new ParcelUuid(SERVICE_UUID))
      .build();
    ScanSettings settings = new ScanSettings.Builder()
      .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
      .build();
    scanning = true;
    try {
      scanner.startScan(java.util.Collections.singletonList(filter), settings, scanCallback);
      call.resolve();
    } catch (SecurityException e) {
      scanning = false;
      call.reject("BLUETOOTH_PERMISSION_DENIED");
    }
  }

  @PluginMethod
  public void stopScan(PluginCall call) {
    if (scanning && scanner != null) {
      try {
        scanner.stopScan(scanCallback);
      } catch (SecurityException ignored) {
      }
    }
    scanning = false;
    call.resolve();
  }

  @PluginMethod
  public void connectAndChallenge(PluginCall call) {
    if (!hasBlePermissions()) {
      call.reject("BLUETOOTH_PERMISSION_DENIED");
      return;
    }
    BluetoothAdapter adapter = adapterOrNull();
    if (adapter == null) {
      call.reject("BLUETOOTH_OFF");
      return;
    }
    String address = call.getString("deviceAddress");
    String challengeHex = call.getString("challengeHex");
    if (address == null || challengeHex == null) {
      call.reject("deviceAddress and challengeHex are required");
      return;
    }
    byte[] challenge = hexToBytes(challengeHex);
    BluetoothDevice device = adapter.getRemoteDevice(address);
    BluetoothGatt existing = gatts.get(address);
    if (existing != null) {
      try {
        existing.disconnect();
        existing.close();
      } catch (Exception ignored) {
      }
      gatts.remove(address);
    }
    BluetoothGatt gatt = device.connectGatt(getContext(), false, new TeacherGattCallback(address, device, challenge));
    gatts.put(address, gatt);
    call.resolve();
  }

  @PluginMethod
  public void startAdvertising(PluginCall call) {
    if (!hasBlePermissions()) {
      call.reject("BLUETOOTH_PERMISSION_DENIED");
      return;
    }
    BluetoothAdapter adapter = adapterOrNull();
    if (adapter == null) {
      call.reject("BLUETOOTH_OFF");
      return;
    }
    String fingerprintHex = call.getString("fingerprintHex");
    if (fingerprintHex == null) {
      call.reject("fingerprintHex is required");
      return;
    }
    stopState();
    signatureBytes = null;
    challengeBytes = null;

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      try {
        gattServer = manager().openGattServer(getContext(), gattServerCallback);
        BluetoothGattService service = new BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY);
        BluetoothGattCharacteristic challengeChar = new BluetoothGattCharacteristic(
          CHALLENGE_UUID,
          BluetoothGattCharacteristic.PROPERTY_WRITE | BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
          BluetoothGattCharacteristic.PERMISSION_WRITE
        );
        BluetoothGattCharacteristic signatureChar = new BluetoothGattCharacteristic(
          SIGNATURE_UUID,
          BluetoothGattCharacteristic.PROPERTY_READ,
          BluetoothGattCharacteristic.PERMISSION_READ
        );
        service.addCharacteristic(challengeChar);
        service.addCharacteristic(signatureChar);
        if (gattServer != null) {
          gattServer.addService(service);
        }

        advertiser = adapter.getBluetoothLeAdvertiser();
        if (advertiser == null) {
          call.reject("BLE_ADVERTISING_UNSUPPORTED");
          return;
        }
        byte[] fpBytes = hexToBytes(fingerprintHex.length() > 32 ? fingerprintHex.substring(0, 32) : fingerprintHex);
        AdvertiseData data = new AdvertiseData.Builder()
          .addServiceUuid(new ParcelUuid(SERVICE_UUID))
          .addManufacturerData(MANUFACTURER_ID, fpBytes)
          .build();
        AdvertiseSettings settings = new AdvertiseSettings.Builder()
          .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
          .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
          .setConnectable(true)
          .build();
        advertiser.startAdvertising(settings, data, advertiseCallback);
        call.resolve();
      } catch (Exception e) {
        call.reject("ADVERTISING_FAILED: " + e.getMessage());
      }
    } else {
      call.reject("BLE_ADVERTISING_UNSUPPORTED");
    }
  }

  @PluginMethod
  public void stopAdvertising(PluginCall call) {
    stopState();
    call.resolve();
  }

  @PluginMethod
  public void sendSignature(PluginCall call) {
    String signatureHex = call.getString("signatureHex");
    if (signatureHex == null) {
      call.reject("signatureHex is required");
      return;
    }
    signatureBytes = hexToBytes(signatureHex);
    call.resolve();
  }

  @PluginMethod
  public void cleanUp(PluginCall call) {
    stopState();
    for (BluetoothGatt gatt : gatts.values()) {
      try {
        gatt.disconnect();
        gatt.close();
      } catch (Exception ignored) {
      }
    }
    gatts.clear();
    fingerprintByAddress.clear();
    call.resolve();
  }

  private void stopState() {
    if (scanning && scanner != null) {
      try {
        scanner.stopScan(scanCallback);
      } catch (SecurityException ignored) {
      }
    }
    scanning = false;
    if (advertising && advertiser != null) {
      try {
        advertiser.stopAdvertising(advertiseCallback);
      } catch (Exception ignored) {
      }
    }
    advertising = false;
    if (gattServer != null) {
      try {
        gattServer.close();
      } catch (Exception ignored) {
      }
    }
    gattServer = null;
    signatureBytes = null;
  }

  private final ScanCallback scanCallback = new ScanCallback() {
    @Override
    public void onScanResult(int callbackType, ScanResult result) {
      super.onScanResult(callbackType, result);
      BluetoothDevice device = result.getDevice();
      byte[] manufacturerData = null;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && result.getScanRecord() != null) {
        manufacturerData = result.getScanRecord().getManufacturerSpecificData(MANUFACTURER_ID);
      }
      if (manufacturerData == null || manufacturerData.length == 0) return;
      String fingerprintHex = bytesToHex(manufacturerData);
      fingerprintByAddress.put(device.getAddress(), fingerprintHex);
      JSObject payload = new JSObject();
      payload.put("fingerprintHex", fingerprintHex);
      payload.put("address", device.getAddress());
      payload.put("rssi", result.getRssi());
      notifyListeners("deviceFound", payload);
    }

    @Override
    public void onScanFailed(int errorCode) {
      super.onScanFailed(errorCode);
      scanning = false;
      JSObject payload = new JSObject();
      payload.put("message", "SCAN_FAILED");
      notifyListeners("scanError", payload);
    }
  };

  private final AdvertiseCallback advertiseCallback = new AdvertiseCallback() {
    @Override
    public void onStartSuccess(AdvertiseSettings settingsInEffect) {
      super.onStartSuccess(settingsInEffect);
      advertising = true;
      notifyListeners("advertisingStarted", new JSObject());
    }

    @Override
    public void onStartFailure(int errorCode) {
      super.onStartFailure(errorCode);
      advertising = false;
      JSObject payload = new JSObject();
      payload.put("message", "ADVERTISING_FAILED_" + errorCode);
      notifyListeners("advertisingError", payload);
    }
  };

  private final BluetoothGattServerCallback gattServerCallback = new BluetoothGattServerCallback() {
    @Override
    public void onConnectionStateChange(BluetoothDevice device, int status, int newState) {
      super.onConnectionStateChange(device, status, newState);
    }

    @Override
    public void onCharacteristicWriteRequest(BluetoothDevice device, int requestId, BluetoothGattCharacteristic characteristic, boolean preparedWrite, boolean responseNeeded, int offset, byte[] value) {
      super.onCharacteristicWriteRequest(device, requestId, characteristic, preparedWrite, responseNeeded, offset, value);
      if (characteristic.getUuid().equals(CHALLENGE_UUID)) {
        challengeBytes = value;
        signatureBytes = null;
        if (gattServer != null) {
          gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null);
        }
        JSObject payload = new JSObject();
        payload.put("challengeHex", bytesToHex(value));
        notifyListeners("challengeReceived", payload);
      }
    }

    @Override
    public void onCharacteristicReadRequest(BluetoothDevice device, int requestId, int offset, BluetoothGattCharacteristic characteristic) {
      super.onCharacteristicReadRequest(device, requestId, offset, characteristic);
      if (signatureBytes != null && offset < signatureBytes.length && gattServer != null) {
        int len = Math.min(signatureBytes.length - offset, 512);
        byte[] part = new byte[len];
        System.arraycopy(signatureBytes, offset, part, 0, len);
        gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, part);
      } else if (gattServer != null) {
        gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, offset, null);
      }
    }
  };

  private class TeacherGattCallback extends BluetoothGattCallback {
    private final String address;
    private final BluetoothDevice device;
    private final byte[] challenge;
    private int readAttempts = 0;
    private BluetoothGattCharacteristic signatureChar;

    TeacherGattCallback(String address, BluetoothDevice device, byte[] challenge) {
      this.address = address;
      this.device = device;
      this.challenge = challenge;
    }

    @Override
    public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
      if (newState == BluetoothProfile.STATE_CONNECTED) {
        gatt.discoverServices();
      } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
        emitDeviceError("disconnected");
        gatts.remove(address);
        try {
          gatt.close();
        } catch (Exception ignored) {
        }
      }
    }

    @Override
    public void onServicesDiscovered(BluetoothGatt gatt, int status) {
      if (status != BluetoothGatt.GATT_SUCCESS) {
        emitDeviceError("service discovery failed");
        return;
      }
      BluetoothGattService service = gatt.getService(SERVICE_UUID);
      if (service == null) {
        emitDeviceError("ACLC service not found");
        return;
      }
      BluetoothGattCharacteristic challengeChar = service.getCharacteristic(CHALLENGE_UUID);
      signatureChar = service.getCharacteristic(SIGNATURE_UUID);
      if (challengeChar == null || signatureChar == null) {
        emitDeviceError("characteristics not found");
        return;
      }
      challengeChar.setValue(challenge);
      gatt.writeCharacteristic(challengeChar);
    }

    @Override
    public void onCharacteristicWrite(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
      if (status != BluetoothGatt.GATT_SUCCESS) {
        emitDeviceError("challenge write failed");
        return;
      }
      readAttempts = 0;
      readSignatureIfReady(gatt);
    }

    private void readSignatureIfReady(BluetoothGatt gatt) {
      if (readAttempts >= MAX_SIGNATURE_READS) {
        emitDeviceError("signature timeout");
        return;
      }
      readAttempts++;
      if (!gatt.readCharacteristic(signatureChar)) {
        emitDeviceError("signature read failed");
      }
    }

    @Override
    public void onCharacteristicRead(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
      if (status != BluetoothGatt.GATT_SUCCESS) {
        handler.postDelayed(() -> {
          if (gatts.containsKey(address)) readSignatureIfReady(gatt);
        }, SIGNATURE_READ_DELAY_MS);
        return;
      }
      byte[] value = characteristic.getValue();
      if (value == null || value.length == 0) {
        handler.postDelayed(() -> {
          if (gatts.containsKey(address)) readSignatureIfReady(gatt);
        }, SIGNATURE_READ_DELAY_MS);
        return;
      }
      String fingerprintHex = fingerprintByAddress.get(address);
      JSObject payload = new JSObject();
      payload.put("fingerprintHex", fingerprintHex != null ? fingerprintHex : "");
      payload.put("address", address);
      payload.put("signatureHex", bytesToHex(value));
      notifyListeners("signatureReceived", payload);
      try {
        gatt.disconnect();
        gatt.close();
      } catch (Exception ignored) {
      }
      gatts.remove(address);
      fingerprintByAddress.remove(address);
    }

    private void emitDeviceError(String message) {
      JSObject payload = new JSObject();
      payload.put("address", address);
      payload.put("message", message);
      notifyListeners("deviceError", payload);
    }
  }

  static byte[] hexToBytes(String hex) {
    int len = hex.length();
    byte[] out = new byte[len / 2];
    for (int i = 0; i < len; i += 2) {
      out[i / 2] = (byte) ((Character.digit(hex.charAt(i), 16) << 4) + Character.digit(hex.charAt(i + 1), 16));
    }
    return out;
  }

  static String bytesToHex(byte[] bytes) {
    StringBuilder sb = new StringBuilder();
    for (byte b : bytes) {
      sb.append(String.format("%02x", b));
    }
    return sb.toString();
  }
}
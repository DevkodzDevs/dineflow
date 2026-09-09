/* Minimal typings for Web Bluetooth and WebUSB (Chrome). Enough for the print transports. */
interface BluetoothRemoteGATTCharacteristic { properties: { write: boolean; writeWithoutResponse: boolean }; service: { device: BluetoothDevice }; writeValue(v: BufferSource): Promise<void>; writeValueWithoutResponse(v: BufferSource): Promise<void>; }
interface BluetoothRemoteGATTService { getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>; }
interface BluetoothRemoteGATTServer { connected: boolean; connect(): Promise<BluetoothRemoteGATTServer>; getPrimaryService(s: string): Promise<BluetoothRemoteGATTService>; }
interface BluetoothDevice { gatt?: BluetoothRemoteGATTServer; name?: string; }
interface USBEndpoint { direction: "in" | "out"; endpointNumber: number; }
interface USBAlternateInterface { interfaceClass: number; endpoints: USBEndpoint[]; }
interface USBInterface { interfaceNumber: number; alternate: USBAlternateInterface; }
interface USBConfiguration { interfaces: USBInterface[]; }
interface USBDevice { opened: boolean; configuration?: USBConfiguration; open(): Promise<void>; selectConfiguration(n: number): Promise<void>; claimInterface(n: number): Promise<void>; transferOut(ep: number, data: BufferSource): Promise<unknown>; }

/* Web Speech API — present in Chrome, Edge and Safari; absent from the DOM lib typings. */
interface SpeechRecognitionAlternative { transcript: string; confidence: number }
interface SpeechRecognitionResult { readonly length: number; readonly isFinal: boolean; [i: number]: SpeechRecognitionAlternative }
interface SpeechRecognitionResultList { readonly length: number; [i: number]: SpeechRecognitionResult }
interface SpeechRecognitionEvent extends Event { readonly results: SpeechRecognitionResultList }
interface SpeechRecognition extends EventTarget { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: SpeechRecognitionEvent) => void) | null; onend: (() => void) | null; onerror: ((e: Event) => void) | null }

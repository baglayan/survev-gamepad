// Minimal WebHID API declarations (Chromium-only)

interface HIDDeviceFilter {
    vendorId?: number;
    productId?: number;
    usagePage?: number;
    usage?: number;
}

interface HIDDeviceRequestOptions {
    filters: HIDDeviceFilter[];
}

interface HIDInputReportEvent extends Event {
    readonly device: HIDDevice;
    readonly reportId: number;
    readonly data: DataView;
}

interface HIDCollectionInfo {
    readonly usagePage: number;
    readonly usage: number;
    readonly children: HIDCollectionInfo[];
}

interface HIDDevice extends EventTarget {
    readonly opened: boolean;
    readonly vendorId: number;
    readonly productId: number;
    readonly productName: string;
    readonly collections: HIDCollectionInfo[];
    oninputreport: ((this: HIDDevice, ev: HIDInputReportEvent) => void) | null;
    open(): Promise<void>;
    close(): Promise<void>;
    forget(): Promise<void>;
    sendReport(reportId: number, data: BufferSource): Promise<void>;
    sendFeatureReport(reportId: number, data: BufferSource): Promise<void>;
    receiveFeatureReport(reportId: number): Promise<DataView>;
}

interface HIDConnectionEvent extends Event {
    readonly device: HIDDevice;
}

interface HID extends EventTarget {
    getDevices(): Promise<HIDDevice[]>;
    requestDevice(options: HIDDeviceRequestOptions): Promise<HIDDevice[]>;
    onconnect: ((this: HID, ev: HIDConnectionEvent) => void) | null;
    ondisconnect: ((this: HID, ev: HIDConnectionEvent) => void) | null;
}

interface Navigator {
    readonly hid?: HID;
}

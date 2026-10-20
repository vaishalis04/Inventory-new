/**
 * seed.js: loads categories + items into the database.
 *
 *   node -r dotenv/config seed.js dotenv_config_path=../.env
 *   node -r dotenv/config seed.js dotenv_config_path=../.env --reset   (wipe company items & categories first)
 *
 * Safe to re-run: items are matched by SKU and UPDATED (name, brand, model, category,
 * custom_fields); new SKUs are inserted. Existing qr_codes are never changed.
 *
 * Env vars: SEED_COMPANY_NAME (default: innobimb infotech), SEED_COMPANY_INDUSTRY
 */
const crypto = require('crypto');
const db = require('./models');

const { sequelize, Company, Category, Item } = db;

const COMPANY = {
  name: process.env.SEED_COMPANY_NAME || 'innobimb infotech',
  industry: process.env.SEED_COMPANY_INDUSTRY || 'CCTV / Security / Networking',
};

const CATEGORIES = [
  {
    "name": "Camera",
    "field_schema": [
      {
        "key": "camera_type",
        "label": "Type"
      },
      {
        "key": "resolution",
        "label": "Resolution"
      },
      {
        "key": "form",
        "label": "Form"
      },
      {
        "key": "view",
        "label": "View"
      }
    ]
  },
  {
    "name": "NVR",
    "field_schema": [
      {
        "key": "channels",
        "label": "Channels"
      }
    ]
  },
  {
    "name": "DVR",
    "field_schema": [
      {
        "key": "channels",
        "label": "Channels"
      }
    ]
  },
  {
    "name": "Cable",
    "field_schema": null
  },
  {
    "name": "Speaker Cable",
    "field_schema": null
  },
  {
    "name": "Telephone Cable",
    "field_schema": null
  },
  {
    "name": "Power Supply",
    "field_schema": [
      {
        "key": "channels",
        "label": "Channels"
      }
    ]
  },
  {
    "name": "Hard Disk",
    "field_schema": [
      {
        "key": "capacity_tb",
        "label": "Capacity (TB)"
      }
    ]
  },
  {
    "name": "PoE Switch",
    "field_schema": [
      {
        "key": "ports",
        "label": "Ports"
      },
      {
        "key": "speed",
        "label": "Speed"
      }
    ]
  },
  {
    "name": "Router",
    "field_schema": null
  },
  {
    "name": "Network Switch",
    "field_schema": [
      {
        "key": "ports",
        "label": "Ports"
      },
      {
        "key": "speed",
        "label": "Speed"
      }
    ]
  },
  {
    "name": "Camera Box",
    "field_schema": null
  },
  {
    "name": "RJ45 Connectors",
    "field_schema": null
  },
  {
    "name": "BNC Connectors",
    "field_schema": null
  },
  {
    "name": "DC Connectors",
    "field_schema": null
  },
  {
    "name": "Control Panel",
    "field_schema": null
  },
  {
    "name": "Magnetic Contact",
    "field_schema": null
  },
  {
    "name": "MFD",
    "field_schema": null
  },
  {
    "name": "GSM Dialer",
    "field_schema": null
  },
  {
    "name": "Sounder",
    "field_schema": null
  },
  {
    "name": "Panic Switch",
    "field_schema": null
  },
  {
    "name": "Keypad",
    "field_schema": null
  },
  {
    "name": "Battery",
    "field_schema": null
  },
  {
    "name": "EPABX",
    "field_schema": null
  },
  {
    "name": "Krone Box",
    "field_schema": null
  },
  {
    "name": "Telephone",
    "field_schema": null
  },
  {
    "name": "Fire Panel",
    "field_schema": null
  },
  {
    "name": "MCP",
    "field_schema": null
  },
  {
    "name": "Smoke Detector",
    "field_schema": null
  },
  {
    "name": "Amplifier",
    "field_schema": null
  },
  {
    "name": "Speaker Wall",
    "field_schema": null
  },
  {
    "name": "Speaker Ceiling",
    "field_schema": null
  },
  {
    "name": "IP VDP Kit",
    "field_schema": null
  },
  {
    "name": "IP VDP Indoor Unit",
    "field_schema": null
  },
  {
    "name": "IP VDP Outdoor Unit",
    "field_schema": null
  },
  {
    "name": "Analog VDP Kit",
    "field_schema": null
  },
  {
    "name": "SD Card",
    "field_schema": [
      {
        "key": "capacity_gb",
        "label": "Capacity (GB)"
      }
    ]
  },
  {
    "name": "Adapter",
    "field_schema": null
  },
  {
    "name": "DVR Cell",
    "field_schema": null
  },
  {
    "name": "Time & Attendance",
    "field_schema": null
  },
  {
    "name": "EM Lock",
    "field_schema": null
  },
  {
    "name": "Exit Switch",
    "field_schema": null
  },
  {
    "name": "L Bracket",
    "field_schema": null
  },
  {
    "name": "U Bracket",
    "field_schema": null
  },
  {
    "name": "Electric Lock",
    "field_schema": null
  },
  {
    "name": "EM Card",
    "field_schema": null
  },
  {
    "name": "Yale Lock",
    "field_schema": null
  },
  {
    "name": "Transmitter and Receiver for Yale Lock",
    "field_schema": null
  },
  {
    "name": "Fiber Cable",
    "field_schema": null
  },
  {
    "name": "Fiber JC Box",
    "field_schema": null
  },
  {
    "name": "Fiber Patch Cable",
    "field_schema": null
  },
  {
    "name": "Fiber Splicing",
    "field_schema": null
  },
  {
    "name": "SFP Module",
    "field_schema": null
  },
  {
    "name": "Fiber Media Converter",
    "field_schema": null
  },
  {
    "name": "HDMI Cable",
    "field_schema": null
  },
  {
    "name": "VGA Cable",
    "field_schema": null
  },
  {
    "name": "Patch Cable",
    "field_schema": null
  },
  {
    "name": "USB Cable",
    "field_schema": null
  },
  {
    "name": "HDMI Extender",
    "field_schema": null
  },
  {
    "name": "HDMI Splitter",
    "field_schema": null
  },
  {
    "name": "HDMI Switcher",
    "field_schema": null
  },
  {
    "name": "HDMI to VGA Converter",
    "field_schema": null
  },
  {
    "name": "USB Extender",
    "field_schema": null
  },
  {
    "name": "VGA Extender",
    "field_schema": null
  },
  {
    "name": "VGA Splitter",
    "field_schema": null
  },
  {
    "name": "VGA Switcher",
    "field_schema": null
  },
  {
    "name": "VGA to HDMI Converter",
    "field_schema": null
  },
  {
    "name": "Monitor",
    "field_schema": null
  },
  {
    "name": "LED TV",
    "field_schema": null
  },
  {
    "name": "Network Rack",
    "field_schema": null
  },
  {
    "name": "PoE Extender",
    "field_schema": null
  },
  {
    "name": "PVC Pipe",
    "field_schema": null
  },
  {
    "name": "Spike",
    "field_schema": null
  },
  {
    "name": "IO Box with Accessories",
    "field_schema": null
  },
  {
    "name": "UPS",
    "field_schema": null
  },
  {
    "name": "Inverter",
    "field_schema": null
  },
  {
    "name": "Inverter Battery",
    "field_schema": null
  },
  {
    "name": "Wall Mount Stand",
    "field_schema": null
  }
];

const ITEMS = [
  {"category": "Camera", "sku": "CAME-PRAMA-IP-4MP-BLT-COLOR-V-W-AUD", "name": "Prama IP 4MP Bullet Colour View with Audio Camera", "brand": "Prama", "model": "IP 4MP Bullet Colour View with Audio", "unit": "pcs", "custom_fields": {"camera_type": "IP", "resolution": "4MP", "form": "Bullet", "view": "Colour View with Audio"}},
  {"category": "Camera", "sku": "CAME-PRAMA-IP-4MP-DOME-COLOR-V-W-AUD", "name": "Prama IP 4MP Dome Colour View with Audio Camera", "brand": "Prama", "model": "IP 4MP Dome Colour View with Audio", "unit": "pcs", "custom_fields": {"camera_type": "IP", "resolution": "4MP", "form": "Dome", "view": "Colour View with Audio"}},
  {"category": "Camera", "sku": "CAME-PRAMA-IP-2MP-COLOR-V-W-AUD-BLT", "name": "Prama IP 2MP Colour View with Audio Bullet Camera", "brand": "Prama", "model": "IP 2MP Colour View with Audio Bullet", "unit": "pcs", "custom_fields": {"camera_type": "IP", "resolution": "2MP", "form": "Bullet", "view": "Colour View with Audio"}},
  {"category": "Camera", "sku": "CAME-PRAMA-IP-2MP-COLOR-V-W-AUD-DOME", "name": "Prama IP 2MP Colour View with Audio Dome Camera", "brand": "Prama", "model": "IP 2MP Colour View with Audio Dome", "unit": "pcs", "custom_fields": {"camera_type": "IP", "resolution": "2MP", "form": "Dome", "view": "Colour View with Audio"}},
  {"category": "Camera", "sku": "CAME-PRAMA-IP-4MP-BLT-NRM", "name": "Prama IP 4MP Bullet Normal Camera", "brand": "Prama", "model": "IP 4MP Bullet Normal", "unit": "pcs", "custom_fields": {"camera_type": "IP", "resolution": "4MP", "form": "Bullet", "view": "Normal"}},
  {"category": "Camera", "sku": "CAME-PRAMA-IP-4MP-DOME-NRM", "name": "Prama IP 4MP Dome Normal Camera", "brand": "Prama", "model": "IP 4MP Dome Normal", "unit": "pcs", "custom_fields": {"camera_type": "IP", "resolution": "4MP", "form": "Dome", "view": "Normal"}},
  {"category": "Camera", "sku": "CAME-PRAMA-IP-MP-COLOR-NRM", "name": "Prama IP MP Colour Normal Camera", "brand": "Prama", "model": "IP MP Colour Normal", "unit": "pcs", "custom_fields": {"camera_type": "IP", "form": "Bullet", "view": "Normal"}},
  {"category": "Camera", "sku": "CAME-PRAMA-IP-2MP-COLOR-NRM", "name": "Prama IP 2MP Colour Normal Camera", "brand": "Prama", "model": "IP 2MP Colour Normal", "unit": "pcs", "custom_fields": {"camera_type": "IP", "resolution": "2MP", "form": "Bullet", "view": "Normal"}},
  {"category": "Camera", "sku": "CAME-TECHTOP-IP-5MP-BLT", "name": "Techtop IP 5MP Bullet Camera", "brand": "Techtop", "model": "IP 5MP Bullet", "unit": "pcs", "custom_fields": {"camera_type": "IP", "resolution": "5MP", "form": "Bullet", "view": "Normal"}},
  {"category": "Camera", "sku": "CAME-CPPLUS-IP-4MP-BLT-COLOR-V-W-AUD", "name": "CP Plus IP 4MP Bullet Colour View with Audio Camera", "brand": "CP Plus", "model": "IP 4MP Bullet Colour View with Audio", "unit": "pcs", "custom_fields": {"camera_type": "IP", "resolution": "4MP", "form": "Bullet", "view": "Colour View with Audio"}},
  {"category": "Camera", "sku": "CAME-CPPLUS-IP-4MP-DOME-COLOR-V-W-AUD", "name": "CP Plus IP 4MP Dome Colour View with Audio Camera", "brand": "CP Plus", "model": "IP 4MP Dome Colour View with Audio", "unit": "pcs", "custom_fields": {"camera_type": "IP", "resolution": "4MP", "form": "Dome", "view": "Colour View with Audio"}},
  {"category": "Camera", "sku": "CAME-CPPLUS-IP-2MP-BLT-COLOR-V-W-AUD", "name": "CP Plus IP 2MP Bullet Colour View with Audio Camera", "brand": "CP Plus", "model": "IP 2MP Bullet Colour View with Audio", "unit": "pcs", "custom_fields": {"camera_type": "IP", "resolution": "2MP", "form": "Bullet", "view": "Colour View with Audio"}},
  {"category": "Camera", "sku": "CAME-CPPLUS-IP-2MP-DOME-COLOR-V-W-AUD", "name": "CP Plus IP 2MP Dome Colour View with Audio Camera", "brand": "CP Plus", "model": "IP 2MP Dome Colour View with Audio", "unit": "pcs", "custom_fields": {"camera_type": "IP", "resolution": "2MP", "form": "Dome", "view": "Colour View with Audio"}},
  {"category": "Camera", "sku": "CAME-CPPLUS-IP-4MP-BLT-NRM", "name": "CP Plus IP 4MP Bullet Normal Camera", "brand": "CP Plus", "model": "IP 4MP Bullet Normal", "unit": "pcs", "custom_fields": {"camera_type": "IP", "resolution": "4MP", "form": "Bullet", "view": "Normal"}},
  {"category": "Camera", "sku": "CAME-CPPLUS-IP-4MP-DOME-NRM", "name": "CP Plus IP 4MP Dome Normal Camera", "brand": "CP Plus", "model": "IP 4MP Dome Normal", "unit": "pcs", "custom_fields": {"camera_type": "IP", "resolution": "4MP", "form": "Dome", "view": "Normal"}},
  {"category": "Camera", "sku": "CAME-CPPLUS-IP-2MP-BLT-NRM", "name": "CP Plus IP 2MP Bullet Normal Camera", "brand": "CP Plus", "model": "IP 2MP Bullet Normal", "unit": "pcs", "custom_fields": {"camera_type": "IP", "resolution": "2MP", "form": "Bullet", "view": "Normal"}},
  {"category": "Camera", "sku": "CAME-CPPLUS-IP-2MP-DOME-NRM", "name": "CP Plus IP 2MP Dome Normal Camera", "brand": "CP Plus", "model": "IP 2MP Dome Normal", "unit": "pcs", "custom_fields": {"camera_type": "IP", "resolution": "2MP", "form": "Dome", "view": "Normal"}},
  {"category": "NVR", "sku": "NVR-PRAMA-4", "name": "Prama 4 Channel NVR", "brand": "Prama", "model": "4 Channel", "unit": "pcs", "custom_fields": {"channels": 4}},
  {"category": "NVR", "sku": "NVR-PRAMA-8", "name": "Prama 8 Channel NVR", "brand": "Prama", "model": "8 Channel", "unit": "pcs", "custom_fields": {"channels": 8}},
  {"category": "NVR", "sku": "NVR-PRAMA-16", "name": "Prama 16 Channel NVR", "brand": "Prama", "model": "16 Channel", "unit": "pcs", "custom_fields": {"channels": 16}},
  {"category": "NVR", "sku": "NVR-PRAMA-32", "name": "Prama 32 Channel NVR", "brand": "Prama", "model": "32 Channel", "unit": "pcs", "custom_fields": {"channels": 32}},
  {"category": "NVR", "sku": "NVR-CPPLUS-4", "name": "CP Plus 4 Channel NVR", "brand": "CP Plus", "model": "4 Channel", "unit": "pcs", "custom_fields": {"channels": 4}},
  {"category": "NVR", "sku": "NVR-CPPLUS-8", "name": "CP Plus 8 Channel NVR", "brand": "CP Plus", "model": "8 Channel", "unit": "pcs", "custom_fields": {"channels": 8}},
  {"category": "NVR", "sku": "NVR-CPPLUS-16", "name": "CP Plus 16 Channel NVR", "brand": "CP Plus", "model": "16 Channel", "unit": "pcs", "custom_fields": {"channels": 16}},
  {"category": "NVR", "sku": "NVR-CPPLUS-32", "name": "CP Plus 32 Channel NVR", "brand": "CP Plus", "model": "32 Channel", "unit": "pcs", "custom_fields": {"channels": 32}},
  {"category": "NVR", "sku": "NVR-HIKVISIO-4", "name": "Hikvision 4 Channel NVR", "brand": "Hikvision", "model": "4 Channel", "unit": "pcs", "custom_fields": {"channels": 4}},
  {"category": "NVR", "sku": "NVR-HIKVISIO-8", "name": "Hikvision 8 Channel NVR", "brand": "Hikvision", "model": "8 Channel", "unit": "pcs", "custom_fields": {"channels": 8}},
  {"category": "NVR", "sku": "NVR-HIKVISIO-16", "name": "Hikvision 16 Channel NVR", "brand": "Hikvision", "model": "16 Channel", "unit": "pcs", "custom_fields": {"channels": 16}},
  {"category": "NVR", "sku": "NVR-HIKVISIO-32", "name": "Hikvision 32 Channel NVR", "brand": "Hikvision", "model": "32 Channel", "unit": "pcs", "custom_fields": {"channels": 32}},
  {"category": "Camera", "sku": "CAME-CPPLUS-IR-5MP-BLT-CLR-V-W-AUD", "name": "CP Plus IR 5MP Bullet Colour View with Audio Camera", "brand": "CP Plus", "model": "IR 5MP Bullet Colour View with Audio", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "5MP", "form": "Bullet", "view": "Colour View with Audio"}},
  {"category": "Camera", "sku": "CAME-CPPLUS-IR-5MP-DOME-CLR-V-W-AUD", "name": "CP Plus IR 5MP Dome Colour View with Audio Camera", "brand": "CP Plus", "model": "IR 5MP Dome Colour View with Audio", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "5MP", "form": "Dome", "view": "Colour View with Audio"}},
  {"category": "Camera", "sku": "CAME-CPPLUS-IR-2MP-DOME-CLR-V-W-AUD", "name": "CP Plus IR 2MP Dome Colour View with Audio Camera", "brand": "CP Plus", "model": "IR 2MP Dome Colour View with Audio", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "2MP", "form": "Dome", "view": "Colour View with Audio"}},
  {"category": "Camera", "sku": "CAME-CPPLUS-IR-5MP-BLT-NRM", "name": "CP Plus IR 5MP Bullet Normal Camera", "brand": "CP Plus", "model": "IR 5MP Bullet Normal", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "5MP", "form": "Bullet", "view": "Normal"}},
  {"category": "Camera", "sku": "CAME-CPPLUS-IR-5MP-DOME-NRM", "name": "CP Plus IR 5MP Dome Normal Camera", "brand": "CP Plus", "model": "IR 5MP Dome Normal", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "5MP", "form": "Dome", "view": "Normal"}},
  {"category": "Camera", "sku": "CAME-CPPLUS-IR-2MP-BLT-NRM", "name": "CP Plus IR 2MP Bullet Normal Camera", "brand": "CP Plus", "model": "IR 2MP Bullet Normal", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "2MP", "form": "Bullet", "view": "Normal"}},
  {"category": "Camera", "sku": "CAME-CPPLUS-IR-2MP-DOME-NRM", "name": "CP Plus IR 2MP Dome Normal Camera", "brand": "CP Plus", "model": "IR 2MP Dome Normal", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "2MP", "form": "Dome", "view": "Normal"}},
  {"category": "Camera", "sku": "CAME-HIKVISIO-IR-5MP-BLT-CLR-V-W-AUD", "name": "Hikvision IR 5MP Bullet Colour View with Audio Camera", "brand": "Hikvision", "model": "IR 5MP Bullet Colour View with Audio", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "5MP", "form": "Bullet", "view": "Colour View with Audio"}},
  {"category": "Camera", "sku": "CAME-HIKVISIO-IR-5MP-DOME-CLR-V-W-AUD", "name": "Hikvision IR 5MP Dome Colour View with Audio Camera", "brand": "Hikvision", "model": "IR 5MP Dome Colour View with Audio", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "5MP", "form": "Dome", "view": "Colour View with Audio"}},
  {"category": "Camera", "sku": "CAME-HIKVISIO-IR-2MP-BLT-CLR-V-W-AUD", "name": "Hikvision IR 2MP Bullet Colour View with Audio Camera", "brand": "Hikvision", "model": "IR 2MP Bullet Colour View with Audio", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "2MP", "form": "Bullet", "view": "Colour View with Audio"}},
  {"category": "Camera", "sku": "CAME-HIKVISIO-IR-2MP-DOME-CLR-V-W-AUD", "name": "Hikvision IR 2MP Dome Colour View with Audio Camera", "brand": "Hikvision", "model": "IR 2MP Dome Colour View with Audio", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "2MP", "form": "Dome", "view": "Colour View with Audio"}},
  {"category": "Camera", "sku": "CAME-HIKVISIO-IR-5MP-BLT-NRM", "name": "Hikvision IR 5MP Bullet Normal Camera", "brand": "Hikvision", "model": "IR 5MP Bullet Normal", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "5MP", "form": "Bullet", "view": "Normal"}},
  {"category": "Camera", "sku": "CAME-HIKVISIO-IR-5MP-DOME-NRM", "name": "Hikvision IR 5MP Dome Normal Camera", "brand": "Hikvision", "model": "IR 5MP Dome Normal", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "5MP", "form": "Dome", "view": "Normal"}},
  {"category": "Camera", "sku": "CAME-HIKVISIO-IR-2MP-BLT-NRM", "name": "Hikvision IR 2MP Bullet Normal Camera", "brand": "Hikvision", "model": "IR 2MP Bullet Normal", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "2MP", "form": "Bullet", "view": "Normal"}},
  {"category": "Camera", "sku": "CAME-HIKVISIO-IR-2MP-DOME-NRM", "name": "Hikvision IR 2MP Dome Normal Camera", "brand": "Hikvision", "model": "IR 2MP Dome Normal", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "2MP", "form": "Dome", "view": "Normal"}},
  {"category": "Camera", "sku": "CAME-PRAMA-IR-5MP-BLT-CLR-V-W-AUD", "name": "Prama IR 5MP Bullet Colour View with Audio Camera", "brand": "Prama", "model": "IR 5MP Bullet Colour View with Audio", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "5MP", "form": "Bullet", "view": "Colour View with Audio"}},
  {"category": "Camera", "sku": "CAME-PRAMA-IR-5MP-DOME-CLR-V-W-AUD", "name": "Prama IR 5MP Dome Colour View with Audio Camera", "brand": "Prama", "model": "IR 5MP Dome Colour View with Audio", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "5MP", "form": "Dome", "view": "Colour View with Audio"}},
  {"category": "Camera", "sku": "CAME-PRAMA-IR-2MP-BLT-CLR-V-W-AUD", "name": "Prama IR 2MP Bullet Colour View with Audio Camera", "brand": "Prama", "model": "IR 2MP Bullet Colour View with Audio", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "2MP", "form": "Bullet", "view": "Colour View with Audio"}},
  {"category": "Camera", "sku": "CAME-PRAMA-IR-2MP-DOME-CLR-V-W-AUD", "name": "Prama IR 2MP Dome Colour View with Audio Camera", "brand": "Prama", "model": "IR 2MP Dome Colour View with Audio", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "2MP", "form": "Dome", "view": "Colour View with Audio"}},
  {"category": "Camera", "sku": "CAME-PRAMA-IR-5MP-BLT-NRM", "name": "Prama IR 5MP Bullet Normal Camera", "brand": "Prama", "model": "IR 5MP Bullet Normal", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "5MP", "form": "Bullet", "view": "Normal"}},
  {"category": "Camera", "sku": "CAME-PRAMA-IR-5MP-DOME-NRM", "name": "Prama IR 5MP Dome Normal Camera", "brand": "Prama", "model": "IR 5MP Dome Normal", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "5MP", "form": "Dome", "view": "Normal"}},
  {"category": "Camera", "sku": "CAME-PRAMA-IR-2MP-BLT-NRM", "name": "Prama IR 2MP Bullet Normal Camera", "brand": "Prama", "model": "IR 2MP Bullet Normal", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "2MP", "form": "Bullet", "view": "Normal"}},
  {"category": "Camera", "sku": "CAME-PRAMA-IR-2MP-DOME-NRM", "name": "Prama IR 2MP Dome Normal Camera", "brand": "Prama", "model": "IR 2MP Dome Normal", "unit": "pcs", "custom_fields": {"camera_type": "IR", "resolution": "2MP", "form": "Dome", "view": "Normal"}},
  {"category": "Camera", "sku": "CAME-CPPLUS-WIFI-CAMERA-INDOOR", "name": "CP Plus Wifi Camera Indoor", "brand": "CP Plus", "model": "Wifi Camera Indoor", "unit": "pcs", "custom_fields": {"camera_type": "WiFi", "view": "Standard", "location": "Indoor"}},
  {"category": "Camera", "sku": "CAME-CPPLUS-WIFI-CAMERA-OUTDOOR", "name": "CP Plus Wifi Camera Outdoor", "brand": "CP Plus", "model": "Wifi Camera Outdoor", "unit": "pcs", "custom_fields": {"camera_type": "WiFi", "view": "Standard", "location": "Outdoor"}},
  {"category": "Camera", "sku": "CAME-CPPLUS-WIFI-CAMERA-OUTDOOR-SIM-SLOT", "name": "CP Plus Wifi Camera Outdoor SIM Slot", "brand": "CP Plus", "model": "Wifi Camera Outdoor SIM Slot", "unit": "pcs", "custom_fields": {"camera_type": "WiFi", "view": "SIM Slot", "location": "Outdoor"}},
  {"category": "Camera", "sku": "CAME-IDADA-WIFI-CAMERA-INDOOR", "name": "Idada Wifi Camera Indoor", "brand": "Idada", "model": "Wifi Camera Indoor", "unit": "pcs", "custom_fields": {"camera_type": "WiFi", "view": "Standard", "location": "Indoor"}},
  {"category": "Camera", "sku": "CAME-IDADA-WIFI-CAMERA-OUTDOOR", "name": "Idada Wifi Camera Outdoor", "brand": "Idada", "model": "Wifi Camera Outdoor", "unit": "pcs", "custom_fields": {"camera_type": "WiFi", "view": "Standard", "location": "Outdoor"}},
  {"category": "Camera", "sku": "CAME-IDADA-WIFI-CAMERA-OUTDOOR-SIM-SLOT", "name": "Idada Wifi Camera Outdoor SIM Slot", "brand": "Idada", "model": "Wifi Camera Outdoor SIM Slot", "unit": "pcs", "custom_fields": {"camera_type": "WiFi", "view": "SIM Slot", "location": "Outdoor"}},
  {"category": "DVR", "sku": "DVR-CPPLUS-4", "name": "CP Plus 4 Channel DVR", "brand": "CP Plus", "model": "4 Channel", "unit": "pcs", "custom_fields": {"channels": 4}},
  {"category": "DVR", "sku": "DVR-CPPLUS-8", "name": "CP Plus 8 Channel DVR", "brand": "CP Plus", "model": "8 Channel", "unit": "pcs", "custom_fields": {"channels": 8}},
  {"category": "DVR", "sku": "DVR-CPPLUS-16", "name": "CP Plus 16 Channel DVR", "brand": "CP Plus", "model": "16 Channel", "unit": "pcs", "custom_fields": {"channels": 16}},
  {"category": "DVR", "sku": "DVR-HIKVISIO-4", "name": "Hikvision 4 Channel DVR", "brand": "Hikvision", "model": "4 Channel", "unit": "pcs", "custom_fields": {"channels": 4}},
  {"category": "DVR", "sku": "DVR-HIKVISIO-8", "name": "Hikvision 8 Channel DVR", "brand": "Hikvision", "model": "8 Channel", "unit": "pcs", "custom_fields": {"channels": 8}},
  {"category": "DVR", "sku": "DVR-HIKVISIO-16", "name": "Hikvision 16 Channel DVR", "brand": "Hikvision", "model": "16 Channel", "unit": "pcs", "custom_fields": {"channels": 16}},
  {"category": "DVR", "sku": "DVR-PRAMA-4", "name": "Prama 4 Channel DVR", "brand": "Prama", "model": "4 Channel", "unit": "pcs", "custom_fields": {"channels": 4}},
  {"category": "DVR", "sku": "DVR-PRAMA-8", "name": "Prama 8 Channel DVR", "brand": "Prama", "model": "8 Channel", "unit": "pcs", "custom_fields": {"channels": 8}},
  {"category": "DVR", "sku": "DVR-PRAMA-16", "name": "Prama 16 Channel DVR", "brand": "Prama", "model": "16 Channel", "unit": "pcs", "custom_fields": {"channels": 16}},
  {"category": "Cable", "sku": "CABL-GEN-5-CORE", "name": "5 Core Cable", "brand": null, "model": "5 Core", "unit": "pcs", "custom_fields": null},
  {"category": "Cable", "sku": "CABL-GEN-CAT-6-CABLE-BUNDEL", "name": "Cat-6 Cable Bundle", "brand": null, "model": "Cat-6 Cable Bundle", "unit": "pcs", "custom_fields": null},
  {"category": "Cable", "sku": "CABL-GEN-6-CORE", "name": "6 Core Cable", "brand": null, "model": "6 Core", "unit": "pcs", "custom_fields": null},
  {"category": "Cable", "sku": "CABL-GEN-8-CORE", "name": "8 Core Cable", "brand": null, "model": "8 Core", "unit": "pcs", "custom_fields": null},
  {"category": "Cable", "sku": "CABL-GEN-12-CORE", "name": "12 Core Cable", "brand": null, "model": "12 Core", "unit": "pcs", "custom_fields": null},
  {"category": "Speaker Cable", "sku": "SC-GEN-SPEAKER-CABLE", "name": "Speaker Cable", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Telephone Cable", "sku": "TC-GEN-2-PAIR", "name": "2 Pair Telephone Cable", "brand": null, "model": "2 Pair", "unit": "pcs", "custom_fields": null},
  {"category": "Telephone Cable", "sku": "TC-GEN-3-PAIR", "name": "3 Pair Telephone Cable", "brand": null, "model": "3 Pair", "unit": "pcs", "custom_fields": null},
  {"category": "Telephone Cable", "sku": "TC-GEN-4-PAIR", "name": "4 Pair Telephone Cable", "brand": null, "model": "4 Pair", "unit": "pcs", "custom_fields": null},
  {"category": "Telephone Cable", "sku": "TC-GEN-5-PAIR", "name": "5 Pair Telephone Cable", "brand": null, "model": "5 Pair", "unit": "pcs", "custom_fields": null},
  {"category": "Cable", "sku": "CABL-GEN-CABLE", "name": "Cable", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Power Supply", "sku": "PS-GEN-4", "name": "4 Channel Power Supply", "brand": null, "model": "4 Channel", "unit": "pcs", "custom_fields": {"channels": 4}},
  {"category": "Power Supply", "sku": "PS-GEN-8", "name": "8 Channel Power Supply", "brand": null, "model": "8 Channel", "unit": "pcs", "custom_fields": {"channels": 8}},
  {"category": "Power Supply", "sku": "PS-GEN-16", "name": "16 Channel Power Supply", "brand": null, "model": "16 Channel", "unit": "pcs", "custom_fields": {"channels": 16}},
  {"category": "Hard Disk", "sku": "HD-GEN-1", "name": "1 TB Hard Disk", "brand": null, "model": "1 TB", "unit": "pcs", "custom_fields": {"capacity_tb": 1}},
  {"category": "Hard Disk", "sku": "HD-GEN-2", "name": "2 TB Hard Disk", "brand": null, "model": "2 TB", "unit": "pcs", "custom_fields": {"capacity_tb": 2}},
  {"category": "Hard Disk", "sku": "HD-GEN-4", "name": "4 TB Hard Disk", "brand": null, "model": "4 TB", "unit": "pcs", "custom_fields": {"capacity_tb": 4}},
  {"category": "Hard Disk", "sku": "HD-GEN-6", "name": "6 TB Hard Disk", "brand": null, "model": "6 TB", "unit": "pcs", "custom_fields": {"capacity_tb": 6}},
  {"category": "Hard Disk", "sku": "HD-GEN-8", "name": "8 TB Hard Disk", "brand": null, "model": "8 TB", "unit": "pcs", "custom_fields": {"capacity_tb": 8}},
  {"category": "Hard Disk", "sku": "HD-GEN-10", "name": "10 TB Hard Disk", "brand": null, "model": "10 TB", "unit": "pcs", "custom_fields": {"capacity_tb": 10}},
  {"category": "PoE Switch", "sku": "PS-SECURUS-8-PORT-GIGA", "name": "Securus 8 Port Giga PoE Switch", "brand": "Securus", "model": "8 Port Giga", "unit": "pcs", "custom_fields": {"ports": 8, "speed": "Giga"}},
  {"category": "PoE Switch", "sku": "PS-SECURUS-4-PORT-GIGA", "name": "Securus 4 Port Giga PoE Switch", "brand": "Securus", "model": "4 Port Giga", "unit": "pcs", "custom_fields": {"ports": 4, "speed": "Giga"}},
  {"category": "PoE Switch", "sku": "PS-TECHTOP-4-PORT-GIGA", "name": "Techtop 4 Port Giga PoE Switch", "brand": "Techtop", "model": "4 Port Giga", "unit": "pcs", "custom_fields": {"ports": 4, "speed": "Giga"}},
  {"category": "PoE Switch", "sku": "PS-TECHTOP-8-PORT-GIGA", "name": "Techtop 8 Port Giga PoE Switch", "brand": "Techtop", "model": "8 Port Giga", "unit": "pcs", "custom_fields": {"ports": 8, "speed": "Giga"}},
  {"category": "PoE Switch", "sku": "PS-CPPLUS-8-PORT-UP-LINK-GIGA", "name": "CP Plus 8 Port Up Link Giga PoE Switch", "brand": "CP Plus", "model": "8 Port Up Link Giga", "unit": "pcs", "custom_fields": {"ports": 8, "speed": "Giga"}},
  {"category": "PoE Switch", "sku": "PS-CPPLUS-4-PORT-UP-LINK-GIGA", "name": "CP Plus 4 Port Up Link Giga PoE Switch", "brand": "CP Plus", "model": "4 Port Up Link Giga", "unit": "pcs", "custom_fields": {"ports": 4, "speed": "Giga"}},
  {"category": "PoE Switch", "sku": "PS-CPPLUS-8-PORT-GIGA", "name": "CP Plus 8 Port Giga PoE Switch", "brand": "CP Plus", "model": "8 Port Giga", "unit": "pcs", "custom_fields": {"ports": 8, "speed": "Giga"}},
  {"category": "PoE Switch", "sku": "PS-CPPLUS-4-PORT-GIGA", "name": "CP Plus 4 Port Giga PoE Switch", "brand": "CP Plus", "model": "4 Port Giga", "unit": "pcs", "custom_fields": {"ports": 4, "speed": "Giga"}},
  {"category": "Router", "sku": "ROUT-TENDA-ROUTER-AC10", "name": "Tenda Router AC10", "brand": "Tenda", "model": "AC10", "unit": "pcs", "custom_fields": null},
  {"category": "Router", "sku": "ROUT-TENDA-ROUTER-N300-NRM", "name": "Tenda Router N300 Normal", "brand": "Tenda", "model": "N300 Normal", "unit": "pcs", "custom_fields": null},
  {"category": "Router", "sku": "ROUT-SECUREYE-ROUTER-SIM-SLOT", "name": "Secureye Router SIM Slot", "brand": "Secureye", "model": "SIM Slot", "unit": "pcs", "custom_fields": null},
  {"category": "Network Switch", "sku": "NS-DLINK-24-NRM-PORT", "name": "D-Link 24 Normal Port Network Switch", "brand": "D-Link", "model": "24 Normal Port", "unit": "pcs", "custom_fields": null},
  {"category": "Network Switch", "sku": "NS-DLINK-16-NRM-PORT", "name": "D-Link 16 Normal Port Network Switch", "brand": "D-Link", "model": "16 Normal Port", "unit": "pcs", "custom_fields": null},
  {"category": "Network Switch", "sku": "NS-DLINK-8-NRM-PORT", "name": "D-Link 8 Normal Port Network Switch", "brand": "D-Link", "model": "8 Normal Port", "unit": "pcs", "custom_fields": null},
  {"category": "Network Switch", "sku": "NS-DLINK-5-NRM-PORT", "name": "D-Link 5 Normal Port Network Switch", "brand": "D-Link", "model": "5 Normal Port", "unit": "pcs", "custom_fields": null},
  {"category": "Network Switch", "sku": "NS-DLINK-24-GIGA-PORT", "name": "D-Link 24 Giga Port Network Switch", "brand": "D-Link", "model": "24 Giga Port", "unit": "pcs", "custom_fields": null},
  {"category": "Network Switch", "sku": "NS-DLINK-16-GIGA-PORT", "name": "D-Link 16 Giga Port Network Switch", "brand": "D-Link", "model": "16 Giga Port", "unit": "pcs", "custom_fields": null},
  {"category": "Network Switch", "sku": "NS-DLINK-8-GIGA-PORT", "name": "D-Link 8 Giga Port Network Switch", "brand": "D-Link", "model": "8 Giga Port", "unit": "pcs", "custom_fields": null},
  {"category": "Network Switch", "sku": "NS-DLINK-5-GIGA-PORT", "name": "D-Link 5 Giga Port Network Switch", "brand": "D-Link", "model": "5 Giga Port", "unit": "pcs", "custom_fields": null},
  {"category": "Network Switch", "sku": "NS-TENDA-24-NRM-PORT", "name": "Tenda 24 Normal Port Network Switch", "brand": "Tenda", "model": "24 Normal Port", "unit": "pcs", "custom_fields": null},
  {"category": "Network Switch", "sku": "NS-TENDA-16-NRM-PORT", "name": "Tenda 16 Normal Port Network Switch", "brand": "Tenda", "model": "16 Normal Port", "unit": "pcs", "custom_fields": null},
  {"category": "Network Switch", "sku": "NS-TENDA-8-NRM-PORT", "name": "Tenda 8 Normal Port Network Switch", "brand": "Tenda", "model": "8 Normal Port", "unit": "pcs", "custom_fields": null},
  {"category": "Network Switch", "sku": "NS-TENDA-5-NRM-PORT", "name": "Tenda 5 Normal Port Network Switch", "brand": "Tenda", "model": "5 Normal Port", "unit": "pcs", "custom_fields": null},
  {"category": "Network Switch", "sku": "NS-TENDA-24-GIGA-PORT", "name": "Tenda 24 Giga Port Network Switch", "brand": "Tenda", "model": "24 Giga Port", "unit": "pcs", "custom_fields": null},
  {"category": "Network Switch", "sku": "NS-TENDA-16-GIGA-PORT", "name": "Tenda 16 Giga Port Network Switch", "brand": "Tenda", "model": "16 Giga Port", "unit": "pcs", "custom_fields": null},
  {"category": "Network Switch", "sku": "NS-TENDA-8-GIGA-PORT", "name": "Tenda 8 Giga Port Network Switch", "brand": "Tenda", "model": "8 Giga Port", "unit": "pcs", "custom_fields": null},
  {"category": "Network Switch", "sku": "NS-TENDA-5-GIGA-PORT", "name": "Tenda 5 Giga Port Network Switch", "brand": "Tenda", "model": "5 Giga Port", "unit": "pcs", "custom_fields": null},
  {"category": "Camera Box", "sku": "CB-GEN-CAMERA-BOX", "name": "Camera Box", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "RJ45 Connectors", "sku": "RC-GEN-RJ45-CONNECTORS", "name": "RJ45 Connectors", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "BNC Connectors", "sku": "BC-GEN-BNC-CONNECTORS", "name": "BNC Connectors", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "DC Connectors", "sku": "DC-GEN-DC-CONNECTORS", "name": "DC Connectors", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Control Panel", "sku": "CP-SECURICO-4-ZONE", "name": "Securico 4 Zone Control Panel", "brand": "Securico", "model": "4 Zone", "unit": "pcs", "custom_fields": null},
  {"category": "Control Panel", "sku": "CP-SECURICO-8-ZONE", "name": "Securico 8 Zone Control Panel", "brand": "Securico", "model": "8 Zone", "unit": "pcs", "custom_fields": null},
  {"category": "Control Panel", "sku": "CP-SECURICO-12-ZONE", "name": "Securico 12 Zone Control Panel", "brand": "Securico", "model": "12 Zone", "unit": "pcs", "custom_fields": null},
  {"category": "Magnetic Contact", "sku": "MC-GEN-MAGNETIC-CONTACT", "name": "Magnetic Contact", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "MFD", "sku": "MFD-GEN-MFD", "name": "MFD", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "GSM Dialer", "sku": "GD-GEN-GSM-DIALER", "name": "GSM Dialer", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Sounder", "sku": "SOUN-GEN-SOUNDER", "name": "Sounder", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Panic Switch", "sku": "PS-GEN-PANIC-SW", "name": "Panic Switch", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Keypad", "sku": "KEYP-GEN-KEYPAD", "name": "Keypad", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Battery", "sku": "BATT-GEN-BATTERY", "name": "Battery", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "EPABX", "sku": "EPAB-GEN-EPABX", "name": "EPABX", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Krone Box", "sku": "KB-GEN-10-PAIR", "name": "10 Pair Krone Box", "brand": null, "model": "10 Pair", "unit": "pcs", "custom_fields": null},
  {"category": "Krone Box", "sku": "KB-GEN-20-PAIR", "name": "20 Pair Krone Box", "brand": null, "model": "20 Pair", "unit": "pcs", "custom_fields": null},
  {"category": "Krone Box", "sku": "KB-GEN-50-PAIR", "name": "50 Pair Krone Box", "brand": null, "model": "50 Pair", "unit": "pcs", "custom_fields": null},
  {"category": "Krone Box", "sku": "KB-GEN-100-PAIR", "name": "100 Pair Krone Box", "brand": null, "model": "100 Pair", "unit": "pcs", "custom_fields": null},
  {"category": "Telephone", "sku": "TELE-PANASONI-TELEPHONE", "name": "Panasonic Telephone", "brand": "Panasonic", "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Telephone", "sku": "TELE-BEETAL-TELEPHONE", "name": "Beetal Telephone", "brand": "Beetal", "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Fire Panel", "sku": "FP-GEN-FIRE-PANEL", "name": "Fire Panel", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "MCP", "sku": "MCP-GEN-MCP", "name": "MCP", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Smoke Detector", "sku": "SD-GEN-SMOKE-DETECTOR", "name": "Smoke Detector", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Amplifier", "sku": "AMPL-GEN-AMPLIFIER", "name": "Amplifier", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Speaker Wall", "sku": "SW-GEN-SPEAKER-WALL", "name": "Speaker Wall", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Speaker Ceiling", "sku": "SC-GEN-SPEAKER-CEILING", "name": "Speaker Ceiling", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "IP VDP Kit", "sku": "IVK-GEN-IP-VDP-KIT", "name": "IP VDP Kit", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "IP VDP Indoor Unit", "sku": "IVIU-GEN-IP-VDP-INDOOR-UNIT", "name": "IP VDP Indoor Unit", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "IP VDP Outdoor Unit", "sku": "IVOU-GEN-IP-VDP-OUTDOOR-UNIT", "name": "IP VDP Outdoor Unit", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Analog VDP Kit", "sku": "AVK-GEN-ANALOG-VDP-KIT", "name": "Analog VDP Kit", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "SD Card", "sku": "SC-GEN-64-GB", "name": "64 GB SD Card", "brand": null, "model": "64 GB", "unit": "pcs", "custom_fields": {"capacity_gb": 64}},
  {"category": "SD Card", "sku": "SC-GEN-128-GB", "name": "128 GB SD Card", "brand": null, "model": "128 GB", "unit": "pcs", "custom_fields": {"capacity_gb": 128}},
  {"category": "Adapter", "sku": "ADAP-GEN-ADAPTER", "name": "Adapter", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "DVR Cell", "sku": "DC-GEN-DVR-CELL", "name": "DVR Cell", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Time & Attendance", "sku": "TA-TIMEOFFI-MACHINE-CARD-OR-FINGER", "name": "Time Office Time & Attendance Machine - Card or Finger", "brand": "Time Office", "model": "Machine - Card or Finger", "unit": "pcs", "custom_fields": null},
  {"category": "Time & Attendance", "sku": "TA-TIMEOFFI-MACHINE-CARD-OR-FINGER-FACE", "name": "Time Office Time & Attendance Machine - Card or Finger Face", "brand": "Time Office", "model": "Machine - Card or Finger Face", "unit": "pcs", "custom_fields": null},
  {"category": "Time & Attendance", "sku": "TA-HIKVISIO-MACHINE-CARD-OR-FINGER", "name": "Hikvision Time & Attendance Machine - Card or Finger", "brand": "Hikvision", "model": "Machine - Card or Finger", "unit": "pcs", "custom_fields": null},
  {"category": "Time & Attendance", "sku": "TA-HIKVISIO-MACHINE-CARD-OR-FINGER-FACE", "name": "Hikvision Time & Attendance Machine - Card or Finger Face", "brand": "Hikvision", "model": "Machine - Card or Finger Face", "unit": "pcs", "custom_fields": null},
  {"category": "EM Lock", "sku": "EL-GEN-EM-LOCK", "name": "EM Lock", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Exit Switch", "sku": "ES-GEN-EXIT-SW", "name": "Exit Switch", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "L Bracket", "sku": "LB-GEN-L-BRACKET", "name": "L Bracket", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "U Bracket", "sku": "UB-GEN-U-BRACKET", "name": "U Bracket", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Electric Lock", "sku": "EL-GEN-ELECTRIC-LOCK", "name": "Electric Lock", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "EM Card", "sku": "EC-GEN-EM-CARD", "name": "EM Card", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Yale Lock", "sku": "YL-GEN-YALE-LOCK", "name": "Yale Lock", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Transmitter and Receiver for Yale Lock", "sku": "TARF-GEN-TRANSMITTER-AND-RECEIVER-FOR-YALE-LOCK", "name": "Transmitter and Receiver for Yale Lock", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Fiber Cable", "sku": "FC-GEN-FIBER-CABLE", "name": "Fiber Cable", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Fiber JC Box", "sku": "FJB-GEN-FIBER-JC-BOX", "name": "Fiber JC Box", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Fiber Patch Cable", "sku": "FPC-GEN-FIBER-PATCH-CABLE", "name": "Fiber Patch Cable", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Fiber Splicing", "sku": "FS-GEN-FIBER-SPLICING", "name": "Fiber Splicing", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "SFP Module", "sku": "SM-GEN-SFP-MODULE", "name": "SFP Module", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Fiber Media Converter", "sku": "FMC-GEN-FIBER-MEDIA-CONVERTER", "name": "Fiber Media Converter", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "HDMI Cable", "sku": "HC-GEN-1-5-MTR", "name": "HDMI Cable 1.5 Mtr", "brand": null, "model": "1.5 Mtr", "unit": "pcs", "custom_fields": {"length_mtr": 1.5}},
  {"category": "HDMI Cable", "sku": "HC-GEN-3-MTR", "name": "HDMI Cable 3 Mtr", "brand": null, "model": "3 Mtr", "unit": "pcs", "custom_fields": {"length_mtr": 3.0}},
  {"category": "HDMI Cable", "sku": "HC-GEN-5-MTR", "name": "HDMI Cable 5 Mtr", "brand": null, "model": "5 Mtr", "unit": "pcs", "custom_fields": {"length_mtr": 5.0}},
  {"category": "HDMI Cable", "sku": "HC-GEN-10-MTR", "name": "HDMI Cable 10 Mtr", "brand": null, "model": "10 Mtr", "unit": "pcs", "custom_fields": {"length_mtr": 10.0}},
  {"category": "HDMI Cable", "sku": "HC-GEN-15-MTR", "name": "HDMI Cable 15 Mtr", "brand": null, "model": "15 Mtr", "unit": "pcs", "custom_fields": {"length_mtr": 15.0}},
  {"category": "VGA Cable", "sku": "VC-GEN-1-5-MTR", "name": "VGA Cable 1.5 Mtr", "brand": null, "model": "1.5 Mtr", "unit": "pcs", "custom_fields": {"length_mtr": 1.5}},
  {"category": "VGA Cable", "sku": "VC-GEN-3-MTR", "name": "VGA Cable 3 Mtr", "brand": null, "model": "3 Mtr", "unit": "pcs", "custom_fields": {"length_mtr": 3.0}},
  {"category": "VGA Cable", "sku": "VC-GEN-5-MTR", "name": "VGA Cable 5 Mtr", "brand": null, "model": "5 Mtr", "unit": "pcs", "custom_fields": {"length_mtr": 5.0}},
  {"category": "VGA Cable", "sku": "VC-GEN-10-MTR", "name": "VGA Cable 10 Mtr", "brand": null, "model": "10 Mtr", "unit": "pcs", "custom_fields": {"length_mtr": 10.0}},
  {"category": "VGA Cable", "sku": "VC-GEN-15-MTR", "name": "VGA Cable 15 Mtr", "brand": null, "model": "15 Mtr", "unit": "pcs", "custom_fields": {"length_mtr": 15.0}},
  {"category": "Patch Cable", "sku": "PC-GEN-1-2-MTR", "name": "Patch Cable 1/2 Mtr", "brand": null, "model": "1/2 Mtr", "unit": "pcs", "custom_fields": null},
  {"category": "USB Cable", "sku": "UC-GEN-USB-CABLE", "name": "USB Cable", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "HDMI Extender", "sku": "HE-GEN-HDMI-EXTENDER", "name": "HDMI Extender", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "HDMI Splitter", "sku": "HS-GEN-HDMI-SPLITTER", "name": "HDMI Splitter", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "HDMI Switcher", "sku": "HS-GEN-HDMI-SWITCHER", "name": "HDMI Switcher", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "HDMI to VGA Converter", "sku": "HTVC-GEN-HDMI-TO-VGA-CONVERTER", "name": "HDMI to VGA Converter", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "USB Extender", "sku": "UE-GEN-USB-EXTENDER", "name": "USB Extender", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "VGA Extender", "sku": "VE-GEN-VGA-EXTENDER", "name": "VGA Extender", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "VGA Splitter", "sku": "VS-GEN-VGA-SPLITTER", "name": "VGA Splitter", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "VGA Switcher", "sku": "VS-GEN-VGA-SWITCHER", "name": "VGA Switcher", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "VGA to HDMI Converter", "sku": "VTHC-GEN-VGA-TO-HDMI-CONVERTER", "name": "VGA to HDMI Converter", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Monitor", "sku": "MONI-GEN-18-5-INC", "name": "18.5 Inch Monitor", "brand": null, "model": "18.5 Inch", "unit": "pcs", "custom_fields": null},
  {"category": "Monitor", "sku": "MONI-GEN-21-INC", "name": "21 Inch Monitor", "brand": null, "model": "21 Inch", "unit": "pcs", "custom_fields": null},
  {"category": "LED TV", "sku": "LT-GEN-LED-TV", "name": "LED TV", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Network Rack", "sku": "NR-GEN-1U-PVC", "name": "1U PVC Network Rack", "brand": null, "model": "1U PVC", "unit": "pcs", "custom_fields": null},
  {"category": "Network Rack", "sku": "NR-GEN-2U-PVC", "name": "2U PVC Network Rack", "brand": null, "model": "2U PVC", "unit": "pcs", "custom_fields": null},
  {"category": "Network Rack", "sku": "NR-GEN-4U-PVC", "name": "4U PVC Network Rack", "brand": null, "model": "4U PVC", "unit": "pcs", "custom_fields": null},
  {"category": "Network Rack", "sku": "NR-GEN-1U-METAL", "name": "1U Metal Network Rack", "brand": null, "model": "1U Metal", "unit": "pcs", "custom_fields": null},
  {"category": "Network Rack", "sku": "NR-GEN-2U-METAL", "name": "2U Metal Network Rack", "brand": null, "model": "2U Metal", "unit": "pcs", "custom_fields": null},
  {"category": "Network Rack", "sku": "NR-GEN-4U-METAL", "name": "4U Metal Network Rack", "brand": null, "model": "4U Metal", "unit": "pcs", "custom_fields": null},
  {"category": "Network Rack", "sku": "NR-GEN-6U-METAL", "name": "6U Metal Network Rack", "brand": null, "model": "6U Metal", "unit": "pcs", "custom_fields": null},
  {"category": "Network Rack", "sku": "NR-GEN-9U-METAL", "name": "9U Metal Network Rack", "brand": null, "model": "9U Metal", "unit": "pcs", "custom_fields": null},
  {"category": "PoE Extender", "sku": "PE-GEN-POE-EXTENDER", "name": "PoE Extender", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "PVC Pipe", "sku": "PP-GEN-PVC-PIPE", "name": "PVC Pipe", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Spike", "sku": "SPIK-GEN-SPIKE", "name": "Spike", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "IO Box with Accessories", "sku": "IBWA-GEN-IO-BOX-W-ACCESSORIES", "name": "IO Box with Accessories", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "UPS", "sku": "UPS-GEN-UPS", "name": "UPS", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Inverter", "sku": "INVE-GEN-INVERTER", "name": "Inverter", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Inverter Battery", "sku": "IB-GEN-INVERTER-BATTERY", "name": "Inverter Battery", "brand": null, "model": null, "unit": "pcs", "custom_fields": null},
  {"category": "Wall Mount Stand", "sku": "WMS-GEN-WALL-MOUNT-STAND", "name": "Wall Mount Stand", "brand": null, "model": null, "unit": "pcs", "custom_fields": null}
];

// Item QR code: ITM-XXXXXXXXXX (14 chars, fits STRING(30))
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const usedQr = new Set();
function genQr() {
  let code;
  do {
    code = 'ITM-' + Array.from({ length: 10 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
  } while (usedQr.has(code));
  usedQr.add(code);
  return code;
}

async function seed() {
  const reset = process.argv.includes('--reset');
  await sequelize.authenticate();
  await sequelize.sync(); // creates missing tables only; never drops anything

  await sequelize.transaction(async (t) => {
    const [company] = await Company.findOrCreate({
      where: { name: COMPANY.name },
      defaults: COMPANY,
      transaction: t,
    });
    const company_id = company.id;

    if (reset) {
      await Item.destroy({ where: { company_id }, transaction: t });
      await Category.destroy({ where: { company_id }, transaction: t });
      console.log('Reset: removed existing items & categories for company', company_id);
    }

    const catIdByName = {};
    for (const c of CATEGORIES) {
      const [row] = await Category.findOrCreate({
        where: { company_id, name: c.name },
        defaults: { company_id, name: c.name, field_schema: c.field_schema, is_active: true },
        transaction: t,
      });
      catIdByName[c.name] = row.id;
    }

    const existing = await Item.findAll({ transaction: t });
    existing.forEach((e) => usedQr.add(e.qr_code));
    const bySku = new Map(existing.filter((e) => e.company_id === company_id).map((e) => [e.sku, e]));

    let added = 0;
    let updated = 0;
    const toCreate = [];
    for (const i of ITEMS) {
      const fields = {
        category_id: catIdByName[i.category],
        name: i.name,
        brand: i.brand,
        model: i.model,
        unit: i.unit,
        custom_fields: i.custom_fields,
      };
      const found = bySku.get(i.sku);
      if (found) {
        await found.update(fields, { transaction: t });
        updated++;
      } else {
        toCreate.push({
          ...fields,
          company_id,
          sku: i.sku,
          units_per_box: 1,
          min_stock: 0,
          qr_code: genQr(),
          is_active: true,
        });
        added++;
      }
    }
    if (toCreate.length) await Item.bulkCreate(toCreate, { transaction: t });

    console.log(`Company   : ${company.name} (id ${company_id})`);
    console.log(`Categories: ${CATEGORIES.length}`);
    console.log(`Items     : ${added} added, ${updated} updated`);
  });
}

seed()
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error('Seeding failed:', err);
    await sequelize.close();
    process.exit(1);
  });
import { findQrImage } from "../api/http";
import DataView from "./DataView";

export default function QrImage({ data, label, size = 160 }) {
  const src = findQrImage(data);
  return (
    <figure className="qr">
      {src ? (
        <img src={src} alt={label || "QR code"} width={size} height={size} />
      ) : (
        <DataView data={data} />
      )}
      {label && <figcaption>{label}</figcaption>}
    </figure>
  );
}

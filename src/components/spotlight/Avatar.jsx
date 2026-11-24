import { useSignedUrl, initials } from "../../hooks/spotlight";

export default function Avatar({ name, path, size = 40 }) {
  const url = useSignedUrl(path);
  const style = { width: size, height: size };
  return url ? (
    <img src={url} alt={name || ""} style={style} className="shrink-0 rounded-full object-cover" />
  ) : (
    <span style={{ ...style, fontSize: size / 2.6 }} className="grid shrink-0 place-items-center rounded-full bg-blue-600/30 font-bold text-blue-200">
      {initials(name)}
    </span>
  );
}

'use client';
export default function Flash({ msg, onClose }) {
  if (!msg) return null;
  return (
    <div className={'flash ' + (msg.type === 'error' ? 'flash-err' : 'flash-ok')} onClick={onClose}>
      {msg.text}
    </div>
  );
}

import { useEffect, useState } from 'react';
import {
  displayNumericValue,
  normalizeNumericOnBlur,
  parseNumericInput,
  sanitizeNumericText
} from '../../lib/numericInput';

export default function NumericInput({
  value,
  onChange,
  blurDefault = 0,
  min,
  max,
  integer = false,
  className = 'input w-20',
  ...rest
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState('');

  const external = displayNumericValue(value);

  useEffect(() => {
    if (!focused) {
      setText(external === '' ? '' : String(external));
    }
  }, [external, focused]);

  const commitText = (raw) => {
    const cleaned = sanitizeNumericText(raw, { integer });
    if (cleaned === null) return;
    setText(cleaned);
    onChange(parseNumericInput(cleaned, { min, max, integer }));
  };

  return (
    <input
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      autoComplete="off"
      value={focused ? text : (external === '' ? '' : String(external))}
      onFocus={() => {
        setFocused(true);
        setText(external === '' ? '' : String(external));
      }}
      onChange={(e) => commitText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        if (text === '') {
          onChange(normalizeNumericOnBlur('', blurDefault));
          setText(String(blurDefault));
          return;
        }
        const parsed = parseNumericInput(text, { min, max, integer });
        const finalValue = parsed === '' ? blurDefault : parsed;
        onChange(finalValue);
        setText(String(finalValue));
      }}
      className={className}
      {...rest}
    />
  );
}

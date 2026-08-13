import { useEffect, useRef, useState } from "react";
import "./CustomSelect.css";
import checkIcon from "../assets/check.svg";

export interface CustomSelectOption {
    value: string;
    label: string;
    sublabel?: string;
    icon?: string;
}

interface CustomSelectProps {
    icon?: string;
    value: string;
    onChange: (value: string) => void;
    options: CustomSelectOption[];
    placeholder?: string;
    title?: string;
    direction?: "up" | "down";
    className?: string;
}

export default function CustomSelect({
    icon,
    value,
    onChange,
    options,
    placeholder = "Select...",
    title,
    direction = "up",
    className = "",
}: CustomSelectProps) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find((opt) => opt.value === value);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") setOpen(false);
        }
        if (open) {
            document.addEventListener("mousedown", handleClickOutside);
            document.addEventListener("keydown", handleKeyDown);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [open]);

    function handleSelect(val: string) {
        onChange(val);
        setOpen(false);
    }

    return (
        <div
            ref={containerRef}
            className={`custom-select-container ${open ? "open" : ""} direction-${direction} ${className}`}
            title={title}
        >
            <button
                type="button"
                className="custom-select-trigger"
                onClick={() => setOpen((prev) => !prev)}
                aria-expanded={open}
            >
                {icon && <img src={icon} alt="" className="custom-select-icon" />}
                <span className="custom-select-label">
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <span className="custom-select-arrow">▾</span>
            </button>

            {open && (
                <div className={`custom-select-menu menu-${direction}`}>
                    {options.length === 0 ? (
                        <div className="custom-select-empty">{placeholder}</div>
                    ) : (
                        options.map((option) => {
                            const isSelected = option.value === value;
                            return (
                                <div
                                    key={option.value}
                                    className={`custom-select-option ${isSelected ? "selected" : ""}`}
                                    onClick={() => handleSelect(option.value)}
                                >
                                    {option.icon && (
                                        <img src={option.icon} alt="" className="custom-select-opt-icon" />
                                    )}
                                    <div className="custom-select-opt-text">
                                        <span className="custom-select-opt-label">{option.label}</span>
                                        {option.sublabel && (
                                            <span className="custom-select-opt-sublabel">
                                                {option.sublabel}
                                            </span>
                                        )}
                                    </div>
                                    {isSelected && (
                                        <img src={checkIcon} alt="Selected" className="custom-select-check" />
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}

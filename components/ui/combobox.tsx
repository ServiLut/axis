"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface ComboboxProps {
  options: { value: string; label: string; category?: string }[]
  value?: string
  onChange: (value: string) => void
  onInputChange?: (value: string) => void
  placeholder?: string
  emptyMessage?: string
  disabled?: boolean
  readOnly?: boolean
  shouldFilter?: boolean
  className?: string
}

export function Combobox({
  options,
  value,
  onChange,
  onInputChange,
  placeholder = "Seleccionar...",
  emptyMessage = "No se encontraron resultados.",
  disabled = false,
  readOnly = false,
  shouldFilter = true,
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)

  const handleOpenChange = (isOpen: boolean) => {
    if (readOnly) {
      setOpen(false);
    } else {
      setOpen(isOpen);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal bg-white", className)}
          disabled={disabled || readOnly}
        >
          <span className="truncate flex items-center gap-2">
            {value
              ? (() => {
                  const opt = options.find((option) => option.value === value);
                  if (!opt) return placeholder;
                  return (
                    <>
                      {opt.category && (
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10">
                          {opt.category}
                        </span>
                      )}
                      <span>{opt.label}</span>
                    </>
                  );
                })()
              : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={shouldFilter}>
          <CommandInput 
            placeholder={placeholder}
            onValueChange={onInputChange}
          />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup key={options.length}>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  keywords={[option.label, option.category || ""]}
                  onSelect={(currentValue) => {
                    onChange(currentValue === value ? "" : currentValue)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex items-center gap-2 w-full overflow-hidden">
                    {option.category && (
                        <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10 shrink-0">
                          {option.category}
                        </span>
                    )}
                    <span className="truncate">{option.label}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

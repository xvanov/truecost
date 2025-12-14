import { useState, useEffect, useRef, useCallback, forwardRef } from 'react';

export interface ParsedAddress {
  formattedAddress: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface AddressAutocompleteProps {
  label?: string;
  value: string;
  onChange: (address: string, parsed: ParsedAddress | null) => void;
  placeholder?: string;
  required?: boolean;
  helperText?: string;
  error?: string;
  id?: string;
  name?: string;
}

// Declare Google Maps types
declare global {
  interface Window {
    google: typeof google;
    initGoogleMapsCallback?: () => void;
  }
}

let googleMapsPromise: Promise<void> | null = null;

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  if (window.google?.maps?.places) {
    return Promise.resolve();
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    // Check if script already exists
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      // Wait for it to load
      const checkGoogleMaps = setInterval(() => {
        if (window.google?.maps?.places) {
          clearInterval(checkGoogleMaps);
          resolve();
        }
      }, 100);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      // Wait for places library to be available
      const checkPlaces = setInterval(() => {
        if (window.google?.maps?.places) {
          clearInterval(checkPlaces);
          resolve();
        }
      }, 50);
    };

    script.onerror = () => {
      googleMapsPromise = null;
      reject(new Error('Failed to load Google Maps script'));
    };

    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

function parseAddressComponents(place: google.maps.places.PlaceResult): ParsedAddress {
  const components = place.address_components || [];
  const result: ParsedAddress = {
    formattedAddress: place.formatted_address || '',
    streetAddress: '',
    city: '',
    state: '',
    zipCode: '',
    country: '',
  };

  let streetNumber = '';
  let route = '';

  for (const component of components) {
    const types = component.types;

    if (types.includes('street_number')) {
      streetNumber = component.long_name;
    } else if (types.includes('route')) {
      route = component.long_name;
    } else if (types.includes('locality')) {
      result.city = component.long_name;
    } else if (types.includes('sublocality_level_1') && !result.city) {
      // Fallback for cities like NYC that use sublocality
      result.city = component.long_name;
    } else if (types.includes('administrative_area_level_1')) {
      result.state = component.short_name; // Use short_name for state (e.g., "CA" instead of "California")
    } else if (types.includes('postal_code')) {
      result.zipCode = component.long_name;
    } else if (types.includes('country')) {
      result.country = component.short_name;
    }
  }

  // Combine street number and route
  result.streetAddress = [streetNumber, route].filter(Boolean).join(' ');

  return result;
}

export const AddressAutocomplete = forwardRef<HTMLInputElement, AddressAutocompleteProps>(
  ({ label, value, onChange, placeholder = 'Start typing an address...', required, helperText, error, id, name }, ref) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [suggestions, setSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const inputRef = useRef<HTMLInputElement>(null);
    const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
    const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
    const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const inputId = id || `address-autocomplete-${Math.random().toString(36).slice(2, 9)}`;

    // Combine refs
    const setRefs = useCallback((node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    }, [ref]);

    // Load Google Maps API
    useEffect(() => {
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

      if (!apiKey) {
        setLoadError('Google Maps API key not configured');
        return;
      }

      loadGoogleMapsScript(apiKey)
        .then(() => {
          autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
          // Create a dummy div for PlacesService (required by API)
          const div = document.createElement('div');
          placesServiceRef.current = new window.google.maps.places.PlacesService(div);
          sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
          setIsLoaded(true);
        })
        .catch((err) => {
          console.error('Failed to load Google Maps:', err);
          setLoadError('Failed to load address autocomplete');
        });
    }, []);

    // Handle click outside to close suggestions
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
          setShowSuggestions(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch suggestions
    const fetchSuggestions = useCallback((input: string) => {
      if (!autocompleteServiceRef.current || !input.trim()) {
        setSuggestions([]);
        return;
      }

      autocompleteServiceRef.current.getPlacePredictions(
        {
          input,
          types: ['address'],
          componentRestrictions: { country: 'us' }, // Restrict to US addresses
          sessionToken: sessionTokenRef.current || undefined,
        },
        (predictions, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
            setSuggestions(predictions);
            setShowSuggestions(true);
          } else {
            setSuggestions([]);
          }
        }
      );
    }, []);

    // Handle input change
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      onChange(newValue, null);
      fetchSuggestions(newValue);
      setHighlightedIndex(-1);
    };

    // Handle suggestion selection
    const handleSelectSuggestion = useCallback((prediction: google.maps.places.AutocompletePrediction) => {
      if (!placesServiceRef.current) return;

      placesServiceRef.current.getDetails(
        {
          placeId: prediction.place_id,
          fields: ['formatted_address', 'address_components'],
          sessionToken: sessionTokenRef.current || undefined,
        },
        (place, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
            const parsed = parseAddressComponents(place);
            onChange(parsed.formattedAddress, parsed);
            setSuggestions([]);
            setShowSuggestions(false);
            // Create new session token for next search
            sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
          }
        }
      );
    }, [onChange]);

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showSuggestions || suggestions.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
            handleSelectSuggestion(suggestions[highlightedIndex]);
          }
          break;
        case 'Escape':
          setShowSuggestions(false);
          setHighlightedIndex(-1);
          break;
      }
    };

    // Handle focus
    const handleFocus = () => {
      if (suggestions.length > 0) {
        setShowSuggestions(true);
      }
    };

    return (
      <div ref={containerRef} className="relative space-y-2">
        {label && (
          <label
            htmlFor={inputId}
            className="block font-body text-body font-medium text-truecost-text-primary"
          >
            {label}
          </label>
        )}

        <input
          ref={setRefs}
          id={inputId}
          name={name}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          placeholder={placeholder}
          required={required}
          className="glass-input w-full"
          autoComplete="off"
          role="combobox"
          aria-expanded={showSuggestions}
          aria-controls={`${inputId}-listbox`}
          aria-autocomplete="list"
          aria-activedescendant={highlightedIndex >= 0 ? `${inputId}-option-${highlightedIndex}` : undefined}
        />

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <ul
            id={`${inputId}-listbox`}
            role="listbox"
            className="absolute z-50 w-full mt-1 max-h-60 overflow-auto rounded-lg border border-truecost-glass-border bg-slate-900 shadow-lg"
          >
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.place_id}
                id={`${inputId}-option-${index}`}
                role="option"
                aria-selected={index === highlightedIndex}
                className={`px-4 py-3 cursor-pointer transition-colors ${
                  index === highlightedIndex
                    ? 'bg-truecost-cyan/20 text-truecost-text-primary'
                    : 'text-truecost-text-secondary hover:bg-truecost-glass-bg/80'
                }`}
                onClick={() => handleSelectSuggestion(suggestion)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <div className="font-body text-body">
                  {suggestion.structured_formatting.main_text}
                </div>
                <div className="font-body text-body-meta text-truecost-text-muted">
                  {suggestion.structured_formatting.secondary_text}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Helper text / Error */}
        {helperText && !error && !loadError && (
          <p className="text-body-meta text-truecost-text-muted">{helperText}</p>
        )}
        {(error || loadError) && (
          <p className="text-body-meta text-truecost-danger">{error || loadError}</p>
        )}

        {/* Loading state indicator */}
        {!isLoaded && !loadError && (
          <p className="text-body-meta text-truecost-text-muted">Loading address autocomplete...</p>
        )}
      </div>
    );
  }
);

AddressAutocomplete.displayName = 'AddressAutocomplete';

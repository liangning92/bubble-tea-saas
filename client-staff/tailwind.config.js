/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "../shared/ShiftSwapProgress.tsx",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../shared/components/PayrollBasisDetails.tsx",
    "../shared/components/InventoryCountEditor.tsx",
    "../shared/components/InventoryCountProgress.tsx",
    "../shared/components/InventoryCountResults.tsx",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#EC6D88',
          hover: '#D94D6E',
          light: '#FCE4EA'
        },
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6',
        surface: '#F9FAFB',
        border: '#E5E7EB'
      },
      borderRadius: {
        'card': '12px',
        'btn': '8px',
        'input': '8px'
      }
    }
  },
  plugins: []
}
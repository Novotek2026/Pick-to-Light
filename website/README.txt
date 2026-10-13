NOVOTEK Pick-to-Light HTML Prototype
====================================

This ZIP contains the HTML/CSS/JavaScript prototype requested by the user.

Files:
- index.html       Main website/application page
- styles.css       NOVOTEK-style UI
- app.js           Prototype navigation, BOM, bins, PICK NOW, history, reports and settings
- assets/Novotek_Logo.png

How to open:
1. Extract the ZIP.
2. Double-click index.html.
3. It will open in Chrome/Edge.

No Node.js or MySQL is required for this prototype.

The prototype stores demo changes in browser localStorage.

Implemented:
- Dashboard
- Active Order
- Parts / Bins
- Add and edit part records with part number, item description, required quantity, and bin
- Add new bin locations from the Parts / Bins editor
- Create BOM lists with a name, description, part numbers, and per-item quantities
- Add customer orders with a linked BOM and Critical / High / Normal / Low priority, then select orders by priority
- Track pick progress separately for each customer order
- Administrator display name is fixed as Suresh Kumar; the picked-by operator remains editable in Settings
- Show current-order progress as a picked / pending / overdue donut chart
- Dashboard order table shows colored status badges, Open/View actions, and a separate material-selection checkbox
- Pick-location panel stays empty until a material is selected, then shows the selected bin number and product description
- All bins shown for the current material selection display a simulated green pick light
- Application typography uses Times New Roman with screen-appropriate text sizing
- Choose Light, Dark, or System appearance from the top-right theme selector; the complete interface palette changes to match and the choice is saved in browser storage
- Header date and live time display in a compact, responsive card beside the theme selector
- Pick History
- Reports
- Settings
- BOM List
- Order List
- Custom BOM
- Favorites
- B1-01 through B2-03 pick bins
- PICK NOW simulation
- Picked/Pending/Progress counters
- Operator and date/time
- Sample order SO-20250928-001
- Sample BOM BOM-001 (Harness Assembly)

The Electron desktop app can open a selected USB serial COM port and
show its live connection state. PICK NOW remains simulated until the
STM32 command protocol is defined. MySQL is not connected. Opening
index.html directly in a browser does not provide USB serial access.

import re

path = '/Users/geoff/Documents/caveauone/warehouse-app/app/tagging/index.tsx'
with open(path, 'r') as f:
    content = f.read()

# Replace the specific state initialization
old_state_init = """  const [state, setState] = useState<TaggingState>(
    isBulkMode || initialBottleId ? "displaying" : "scanning",
  );"""

new_state_init = """  const [state, setState] = useState<TaggingState>(
    isBulkMode || initialBottleId ? "displaying" : "entry",
  );
  
  // Entry States
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const [isBottlePickerModalOpen, setIsBottlePickerModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [masterWines, setMasterWines] = useState<MasterWine[]>([]);
  const [bottlesList, setBottlesList] = useState<BottleWithLocation[]>([]);"""

content = content.replace(old_state_init, new_state_init)

# Fix setMasterWines warning if it's there
# I see the error "Cannot find name 'setMasterWines'." Which means `fetchMasterWines` might have been put somewhere wrong, or it's just missing the state var.
# Now that `setMasterWines` is added, it will work.

with open(path, 'w') as f:
    f.write(content)

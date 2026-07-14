const fs = require('fs');

const path = '/Users/geoff/Documents/caveauone/warehouse-app/app/tagging/index.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. TaggingState
content = content.replace(
  'type TaggingState = "scanning" | "displaying" | "updating" | "success";',
  'type TaggingState = "entry" | "scanning_qr" | "displaying" | "updating" | "success";'
);

// 2. Imports
content = content.replace(
  'import CustomerPickerModal from "../../components/CustomerPickerModal";',
  `import CustomerPickerModal from "../../components/CustomerPickerModal";
import LabelScanModal from "@/components/LabelScanModal";
import BottlePickerModal, { BottleWithLocation } from "@/components/BottlePickerModal";`
);

// 3. state init
content = content.replace(
  'const [state, setState] = useState<TaggingState>("scanning");',
  `const [state, setState] = useState<TaggingState>("entry");
  
  // Entry States
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const [isBottlePickerModalOpen, setIsBottlePickerModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [masterWines, setMasterWines] = useState<MasterWine[]>([]);
  const [bottlesList, setBottlesList] = useState<BottleWithLocation[]>([]);`
);

// 4. fetchMasterWines
content = content.replace(
  'useEffect(() => {',
  `useEffect(() => {
    const fetchMasterWines = async () => {
      try {
        const snap = await getDocs(collection(db, "master_wines"));
        setMasterWines(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MasterWine)));
      } catch (err) {}
    };
    fetchMasterWines();`
);

// 5. handleSelectWine for entry
content = content.replace(
  'const fetchLocations = async () => {',
  `const handleSelectWine = async (wineId: string) => {
    try {
      const q = query(
        collection(db, "inventory_bottles"),
        where("masterWineRef", "==", doc(db, "master_wines", wineId)),
        where("status", "in", ["received", "shelved"])
      );
      const snap = await getDocs(q);
      const bottles: BottleWithLocation[] = [];
      const locationCache: Record<string, string> = {};

      for (const d of snap.docs) {
        const data = d.data() as InventoryBottle;
        let locName = "Unassigned";
        if (data.locationRef) {
          if (locationCache[data.locationRef.id]) {
            locName = locationCache[data.locationRef.id];
          } else {
            const locSnap = await getDoc(data.locationRef);
            if (locSnap.exists()) {
              locName = locSnap.data().name;
              locationCache[data.locationRef.id] = locName;
            }
          }
        }
        bottles.push({
          bottleId: d.id,
          locationName: locName,
          locationId: data.locationRef?.id || "unassigned",
        });
      }
      setBottlesList(bottles);
      if (bottles.length === 1) {
        loadBottleData(bottles[0].bottleId);
      } else {
        setIsBottlePickerModalOpen(true);
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Could not load bottles.");
    }
  };

  const filteredWines = masterWines
    .filter(
      (w) =>
        w.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.vintage?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .slice(0, 10);

  const fetchLocations = async () => {`
);

// 6. scanner UI replacement
const oldScanner = `{/* ── Scanner ── */}
      {state === "scanning" && (
        <View style={styles.scannerContainer}>
          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={handleBarcodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          >
            <View style={styles.overlay}>
              <View style={styles.scanTargetContainer}>
                <View style={styles.scanTarget} />
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
                <ScanQrCode
                  size={40}
                  color="rgba(16, 185, 129, 0.5)"
                  style={styles.centerIcon}
                />
              </View>
              <Text style={styles.instructionText}>
                CENTER QR CODE IN FRAME
              </Text>
              <TouchableOpacity
                onPress={() => router.back()}
                style={styles.closeButton}
              >
                <X size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          </CameraView>
        </View>
      )}`;

const newEntry = `{/* ── Entry Options ── */}
      {state === "entry" && (
        <View style={{ flex: 1, padding: 24 }}>
          <Text style={{ fontSize: 32, fontWeight: "900", marginBottom: 8, color: theme.text }}>Move or Tag</Text>
          <Text style={{ fontSize: 16, color: theme.textSecondary, marginBottom: 24 }}>Find the bottle you want to move.</Text>

          <View style={{ gap: 16, marginBottom: 32 }}>
            <TouchableOpacity 
              style={{ flexDirection: "row", alignItems: "center", padding: 20, borderWidth: 1, borderColor: theme.border, borderRadius: 16, backgroundColor: theme.card }}
              onPress={() => setState("scanning_qr")}
            >
              <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: theme.primary + "20", alignItems: "center", justifyContent: "center" }}>
                <ScanQrCode size={24} color={theme.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: theme.text }}>Scan QR Code</Text>
                <Text style={{ fontSize: 14, color: theme.textSecondary }}>Fastest if bottle has sticker.</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={{ flexDirection: "row", alignItems: "center", padding: 20, borderWidth: 1, borderColor: theme.border, borderRadius: 16, backgroundColor: theme.card }}
              onPress={() => setIsLabelModalOpen(true)}
            >
              <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: theme.primary + "20", alignItems: "center", justifyContent: "center" }}>
                <Camera size={24} color={theme.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: theme.text }}>Scan Label (AI)</Text>
                <Text style={{ fontSize: 14, color: theme.textSecondary }}>Verify physical wine label.</Text>
              </View>
            </TouchableOpacity>
          </View>

          <Text style={{ fontSize: 14, fontWeight: "800", color: theme.textSecondary, marginBottom: 12, textTransform: "uppercase" }}>Search Wine</Text>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, marginBottom: 16 }}>
            <Search size={20} color={theme.textSecondary} />
            <TextInput
              style={{ flex: 1, fontSize: 16, marginLeft: 12, color: theme.text }}
              placeholder="Search by name, SKU..."
              placeholderTextColor={theme.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <X size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={{ flex: 1 }}>
            {filteredWines.map((w) => (
              <TouchableOpacity
                key={w.id}
                style={{ flexDirection: "row", alignItems: "center", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.border }}
                onPress={() => handleSelectWine(w.id)}
              >
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(0,0,0,0.05)", alignItems: "center", justifyContent: "center" }}>
                  <Wine size={20} color={theme.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: theme.text }}>{w.name}</Text>
                  <Text style={{ fontSize: 14, color: theme.textSecondary }}>{w.vintage} • {w.producer}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <LabelScanModal 
            visible={isLabelModalOpen}
            onClose={() => setIsLabelModalOpen(false)}
            onBottleSelected={(id) => loadBottleData(id)}
            theme={theme}
          />
          <BottlePickerModal
            visible={isBottlePickerModalOpen}
            onClose={() => setIsBottlePickerModalOpen(false)}
            onBottleSelected={(id) => {
              setIsBottlePickerModalOpen(false);
              loadBottleData(id);
            }}
            bottles={bottlesList}
            theme={theme}
          />
        </View>
      )}

      {/* ── QR Scanner ── */}
      {state === "scanning_qr" && (
        <View style={styles.scannerContainer}>
          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={handleBarcodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          >
            <View style={styles.overlay}>
              <View style={styles.scanTargetContainer}>
                <View style={styles.scanTarget} />
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
                <ScanQrCode
                  size={40}
                  color="rgba(16, 185, 129, 0.5)"
                  style={styles.centerIcon}
                />
              </View>
              <Text style={styles.instructionText}>
                CENTER QR CODE IN FRAME
              </Text>
              <TouchableOpacity
                onPress={() => setState("entry")}
                style={styles.closeButton}
              >
                <X size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          </CameraView>
        </View>
      )}`;

content = content.replace(oldScanner, newEntry);

// 7. globally replace setState("scanning") with setState("entry")
content = content.replace(/setState\("scanning"\)/g, 'setState("entry")');

// 8. update state === "scanning" to state === "entry" globally where applicable
content = content.replace(/state !== "scanning"/g, 'state !== "entry" && state !== "scanning_qr"');

fs.writeFileSync(path, content, 'utf8');

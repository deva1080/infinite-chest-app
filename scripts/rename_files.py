import os
import json
import shutil

# Paths
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
configs_path = os.path.join(base_dir, 'lib', 'new-configs,json')
source_dir = os.path.join(base_dir, 'public', 'collections_optimized')
target_dir = os.path.join(base_dir, 'public', 'collections_final')

# Create target dir if it doesn't exist
os.makedirs(target_dir, exist_ok=True)

# Load configs
with open(configs_path, 'r', encoding='utf-8') as f:
    configs = json.load(f)

# Special mappings: configId -> collectionId
special_mappings = {
    3: 7,
    7: 8,
    11: 9,
    15: 10,
    19: 11
}

used_images = set()
assignments = []

# 1. Assign special collections first
for config_id, collection_id in special_mappings.items():
    config = next((c for c in configs if c.get('configId') == config_id), None)
    if not config:
        continue
    
    # Filter out chest token (10000000010)
    token_ids = [tid for tid in config.get('tokenIds', []) if tid != 10000000010]
    
    for index, token_id in enumerate(token_ids):
        image_name = f"{collection_id}_{index}.webp"
        used_images.add(image_name)
        assignments.append({
            'source': image_name,
            'target': f"{config_id}_{token_id}.webp"
        })

# 2. Collect remaining images in order
pool = []
for c in range(1, 13):
    for i in range(9):
        image_name = f"{c}_{i}.webp"
        if image_name not in used_images and os.path.exists(os.path.join(source_dir, image_name)):
            pool.append(image_name)

# 3. Process remaining configs in order
special_config_ids = list(special_mappings.keys())
remaining_configs = [c for c in configs if c.get('configId') not in special_config_ids]
remaining_configs.sort(key=lambda x: x.get('configId', 0))

for config in remaining_configs:
    token_ids = [tid for tid in config.get('tokenIds', []) if tid != 10000000010]
    
    for token_id in token_ids:
        if not pool:
            print(f"Missing images in pool for configId {config.get('configId')}, tokenId {token_id}!")
            break
        image_name = pool.pop(0)
        assignments.append({
            'source': image_name,
            'target': f"{config.get('configId')}_{token_id}.webp"
        })

# 4. Execute copy and rename
success_count = 0
for task in assignments:
    source_path = os.path.join(source_dir, task['source'])
    target_path = os.path.join(target_dir, task['target'])
    
    if os.path.exists(source_path):
        shutil.copy2(source_path, target_path)
        print(f"Copied: {task['source']} -> {task['target']}")
        success_count += 1
    else:
        print(f"Source file not found: {task['source']}")

print(f"\nFinished! Successfully processed {success_count} images.")
if pool:
    print(f"Remaining images in pool: {', '.join(pool)}")

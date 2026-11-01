include $(ROOTDIR)/rules.mk

PKG_NAME:=networkmap

include $(INCLUDE_DIR)/package.mk

TARGET_CFLAGS += -I$(STAGING_DIR)/include/shared
TARGET_LDFLAGS += -L$(STAGING_DIR)/lib

$(eval $(call BuildPackage,networkmap))

# 本地源码改动必须重新准备构建目录，不能沿用旧的 .built 标记。
$(STAMP_PREPARED): Makefile $(wildcard $(SRC_DIR)/*)

romfs:
	$(INSTALL_DIR) $(ROMFSDIR)/usr/sbin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/networkmap $(ROMFSDIR)/usr/sbin/networkmap
